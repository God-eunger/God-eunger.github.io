(function () {
  "use strict";

  var sidebar = document.getElementById("sidebar");
  var canvas = sidebar && sidebar.querySelector(".ink-drop");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!sidebar || !canvas || !navigator.gpu || reducedMotion.matches) return;

  var simulationShader = `
struct Params {
  size: vec2<u32>,
  dt: f32,
  time: f32,
  pointer: vec2<f32>,
  pointerVelocity: vec2<f32>,
  obstacleRadius: vec2<f32>,
  padding: vec2<f32>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> inputState: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> outputState: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> divergence: array<f32>;
@group(0) @binding(4) var<storage, read> pressureInput: array<f32>;
@group(0) @binding(5) var<storage, read_write> pressureOutput: array<f32>;

fn cellIndex(cell: vec2<u32>) -> u32 {
  return cell.x + cell.y * params.size.x;
}

fn inBounds(cell: vec2<i32>) -> bool {
  return all(cell >= vec2<i32>(0)) && all(cell < vec2<i32>(params.size));
}

fn isBoundary(cell: vec2<u32>) -> bool {
  return cell.x == 0u || cell.y == 0u ||
    cell.x + 1u == params.size.x || cell.y + 1u == params.size.y;
}

fn cellUv(cell: vec2<u32>) -> vec2<f32> {
  return (vec2<f32>(cell) + vec2<f32>(0.5)) / vec2<f32>(params.size);
}

fn isObstacleUv(uv: vec2<f32>) -> bool {
  let delta = (uv - params.pointer) / params.obstacleRadius;
  return dot(delta, delta) <= 1.0;
}

fn isObstacle(cell: vec2<u32>) -> bool {
  return isObstacleUv(cellUv(cell));
}

fn obstacleVelocity() -> vec2<f32> {
  return params.pointerVelocity;
}

fn stateAt(cell: vec2<i32>) -> vec4<f32> {
  let safeCell = vec2<u32>(clamp(cell, vec2<i32>(0), vec2<i32>(params.size) - vec2<i32>(1)));
  if (isBoundary(safeCell) || isObstacle(safeCell)) {
    return vec4<f32>(obstacleVelocity(), 0.0, 0.0);
  }
  return inputState[cellIndex(safeCell)];
}

fn sampleState(position: vec2<f32>) -> vec4<f32> {
  let gridPosition = clamp(
    position * vec2<f32>(params.size) - vec2<f32>(0.5),
    vec2<f32>(0.0),
    vec2<f32>(params.size) - vec2<f32>(1.001)
  );
  let low = vec2<i32>(floor(gridPosition));
  let high = min(low + vec2<i32>(1), vec2<i32>(params.size) - vec2<i32>(1));
  let fraction = fract(gridPosition);
  let top = mix(stateAt(vec2<i32>(low.x, low.y)), stateAt(vec2<i32>(high.x, low.y)), fraction.x);
  let bottom = mix(stateAt(vec2<i32>(low.x, high.y)), stateAt(vec2<i32>(high.x, high.y)), fraction.x);
  return mix(top, bottom, fraction.y);
}

fn velocityAt(cell: vec2<i32>) -> vec2<f32> {
  if (!inBounds(cell)) { return vec2<f32>(0.0); }
  let safeCell = vec2<u32>(cell);
  if (isObstacle(safeCell)) { return obstacleVelocity(); }
  if (isBoundary(safeCell)) { return vec2<f32>(0.0); }
  return inputState[cellIndex(safeCell)].xy;
}

fn curlAt(cell: vec2<i32>) -> f32 {
  if (!inBounds(cell)) { return 0.0; }
  let safeCell = vec2<u32>(cell);
  if (isBoundary(safeCell) || isObstacle(safeCell)) { return 0.0; }

  let left = velocityAt(cell + vec2<i32>(-1, 0)).y;
  let right = velocityAt(cell + vec2<i32>(1, 0)).y;
  let top = velocityAt(cell + vec2<i32>(0, -1)).x;
  let bottom = velocityAt(cell + vec2<i32>(0, 1)).x;
  return 0.5 * (
    (right - left) * f32(params.size.x) -
    (bottom - top) * f32(params.size.y)
  );
}

fn pressureAt(cell: vec2<i32>, centerPressure: f32) -> f32 {
  if (!inBounds(cell)) { return centerPressure; }
  let safeCell = vec2<u32>(cell);
  if (isBoundary(safeCell) || isObstacle(safeCell)) { return centerPressure; }
  return pressureInput[cellIndex(safeCell)];
}

@compute @workgroup_size(8, 8)
fn forces(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.xy;
  if (any(cell >= params.size)) { return; }
  let offset = cellIndex(cell);

  if (isBoundary(cell)) {
    outputState[offset] = vec4<f32>(0.0);
    return;
  }
  if (isObstacle(cell)) {
    outputState[offset] = vec4<f32>(obstacleVelocity(), 0.0, 0.0);
    return;
  }

  let uv = cellUv(cell);
  let previousState = inputState[offset];
  var velocity = previousState.xy * pow(0.9999, params.dt);
  var density = previousState.z * pow(0.70, params.dt);

  let sourceCenter = vec2<f32>(0.5 + 0.12 * sin(params.time * 0.37), 0.065);
  let sourceDelta = (uv - sourceCenter) / vec2<f32>(0.05, 0.018);
  let sourcePulse = pow(max(0.0, cos(params.time * 2.4)), 18.0);
  let source = max(0.0, 1.0 - dot(sourceDelta, sourceDelta)) * sourcePulse;
  density = min(12.0, density + params.dt * 100.0 * source);

  let position = vec2<i32>(cell);
  let curl = curlAt(position);
  let curlGradient = 0.5 * vec2<f32>(
    (abs(curlAt(position + vec2<i32>(1, 0))) - abs(curlAt(position + vec2<i32>(-1, 0)))) * f32(params.size.x),
    (abs(curlAt(position + vec2<i32>(0, 1))) - abs(curlAt(position + vec2<i32>(0, -1)))) * f32(params.size.y)
  );
  let curlNormal = curlGradient / max(length(curlGradient), 0.00001);
  let cellScale = 1.0 / f32(max(params.size.x, params.size.y));
  let confinement = 6.0 * cellScale * curl * vec2<f32>(curlNormal.y, -curlNormal.x);

  velocity = velocity + vec2<f32>(
    params.dt * 0.022 * sin(f32(cell.y) * 0.31 + params.time * 1.7),
    params.dt * (1.5 * source + 1.25 * density)
  ) + params.dt * confinement;

  let obstacleDelta = (uv - params.pointer) / params.obstacleRadius;
  let obstacleDistance = length(obstacleDelta);
  let boundaryInfluence = 1.0 - smoothstep(1.0, 1.75, obstacleDistance);
  velocity = mix(velocity, obstacleVelocity(), boundaryInfluence * 0.45);

  outputState[offset] = vec4<f32>(velocity, density, 0.0);
}

@compute @workgroup_size(8, 8)
fn advect(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.xy;
  if (any(cell >= params.size)) { return; }
  let offset = cellIndex(cell);

  if (isBoundary(cell)) {
    outputState[offset] = vec4<f32>(0.0);
    return;
  }
  if (isObstacle(cell)) {
    outputState[offset] = vec4<f32>(obstacleVelocity(), 0.0, 0.0);
    return;
  }

  let uv = cellUv(cell);
  let velocity = inputState[offset].xy;
  outputState[offset] = sampleState(uv - params.dt * velocity);
}

@compute @workgroup_size(8, 8)
fn computeDivergence(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.xy;
  if (any(cell >= params.size)) { return; }
  let offset = cellIndex(cell);
  pressureOutput[offset] = 0.0;

  if (isBoundary(cell) || isObstacle(cell)) {
    divergence[offset] = 0.0;
    return;
  }

  let position = vec2<i32>(cell);
  let left = velocityAt(position + vec2<i32>(-1, 0)).x;
  let right = velocityAt(position + vec2<i32>(1, 0)).x;
  let top = velocityAt(position + vec2<i32>(0, -1)).y;
  let bottom = velocityAt(position + vec2<i32>(0, 1)).y;
  let scale = vec2<f32>(params.size);
  divergence[offset] = -0.5 * ((right - left) * scale.x + (bottom - top) * scale.y);
}

@compute @workgroup_size(8, 8)
fn solvePressure(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.xy;
  if (any(cell >= params.size)) { return; }
  let offset = cellIndex(cell);

  if (isBoundary(cell) || isObstacle(cell)) {
    pressureOutput[offset] = 0.0;
    return;
  }

  let position = vec2<i32>(cell);
  let center = pressureInput[offset];
  let left = pressureAt(position + vec2<i32>(-1, 0), center);
  let right = pressureAt(position + vec2<i32>(1, 0), center);
  let top = pressureAt(position + vec2<i32>(0, -1), center);
  let bottom = pressureAt(position + vec2<i32>(0, 1), center);
  let inverseSizeSquared = 1.0 / (vec2<f32>(params.size) * vec2<f32>(params.size));
  let numerator =
    (left + right) * inverseSizeSquared.y +
    (top + bottom) * inverseSizeSquared.x +
    divergence[offset] * inverseSizeSquared.x * inverseSizeSquared.y;
  pressureOutput[offset] = numerator / (2.0 * (inverseSizeSquared.x + inverseSizeSquared.y));
}

@compute @workgroup_size(8, 8)
fn subtractGradient(@builtin(global_invocation_id) id: vec3<u32>) {
  let cell = id.xy;
  if (any(cell >= params.size)) { return; }
  let offset = cellIndex(cell);

  if (isBoundary(cell)) {
    outputState[offset] = vec4<f32>(0.0);
    return;
  }
  if (isObstacle(cell)) {
    outputState[offset] = vec4<f32>(obstacleVelocity(), 0.0, 0.0);
    return;
  }

  let position = vec2<i32>(cell);
  let center = pressureInput[offset];
  let left = pressureAt(position + vec2<i32>(-1, 0), center);
  let right = pressureAt(position + vec2<i32>(1, 0), center);
  let top = pressureAt(position + vec2<i32>(0, -1), center);
  let bottom = pressureAt(position + vec2<i32>(0, 1), center);
  let input = inputState[offset];
  var velocity = input.xy - vec2<f32>(
    0.5 * f32(params.size.x) * (right - left),
    0.5 * f32(params.size.y) * (bottom - top)
  );

  let leftCell = vec2<u32>(max(position + vec2<i32>(-1, 0), vec2<i32>(0)));
  let rightCell = vec2<u32>(min(position + vec2<i32>(1, 0), vec2<i32>(params.size) - vec2<i32>(1)));
  let topCell = vec2<u32>(max(position + vec2<i32>(0, -1), vec2<i32>(0)));
  let bottomCell = vec2<u32>(min(position + vec2<i32>(0, 1), vec2<i32>(params.size) - vec2<i32>(1)));
  if (isObstacle(leftCell) || isObstacle(rightCell)) {
    velocity = vec2<f32>(params.pointerVelocity.x, velocity.y);
  }
  if (isObstacle(topCell) || isObstacle(bottomCell)) {
    velocity = vec2<f32>(velocity.x, params.pointerVelocity.y);
  }

  outputState[offset] = vec4<f32>(velocity, input.z, 0.0);
}
`;

  var renderShader = `
struct Params {
  size: vec2<u32>,
  dt: f32,
  time: f32,
  pointer: vec2<f32>,
  pointerVelocity: vec2<f32>,
  obstacleRadius: vec2<f32>,
  padding: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> state: array<vec4<f32>>;

fn densityAt(cell: vec2<i32>) -> f32 {
  let safeCell = vec2<u32>(clamp(cell, vec2<i32>(0), vec2<i32>(params.size) - vec2<i32>(1)));
  return state[safeCell.x + safeCell.y * params.size.x].z;
}

fn sampleDensity(uv: vec2<f32>) -> f32 {
  let position = clamp(
    uv * vec2<f32>(params.size) - vec2<f32>(0.5),
    vec2<f32>(0.0),
    vec2<f32>(params.size) - vec2<f32>(1.001)
  );
  let low = vec2<i32>(floor(position));
  let high = min(low + vec2<i32>(1), vec2<i32>(params.size) - vec2<i32>(1));
  let fraction = fract(position);
  let top = mix(densityAt(vec2<i32>(low.x, low.y)), densityAt(vec2<i32>(high.x, low.y)), fraction.x);
  let bottom = mix(densityAt(vec2<i32>(low.x, high.y)), densityAt(vec2<i32>(high.x, high.y)), fraction.x);
  return mix(top, bottom, fraction.y);
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  var output: VertexOutput;
  let position = positions[index];
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = vec2<f32>(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let density = clamp(sampleDensity(input.uv), 0.0, 1.0);
  let alpha = density * 0.58;
  return vec4<f32>(vec3<f32>(0.78, 0.90, 0.97) * alpha, alpha);
}
`;

  var device;
  var context;
  var format;
  var uniformBuffer;
  var stateBuffers;
  var pressureBuffers;
  var divergenceBuffer;
  var pipelines;
  var bindGroups;
  var gridWidth = 0;
  var gridHeight = 0;
  var currentState = 0;
  var lastFrame = 0;
  var simulationTime = 0;
  var resizePending = true;
  var sidebarVisible = true;
  var pointer = {
    clientX: -1,
    clientY: -1,
    previousX: -1,
    previousY: -1,
    previousTime: 0,
    velocityX: 0,
    velocityY: 0
  };

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function createBuffer(size, usage) {
    return device.createBuffer({ size: Math.ceil(size / 4) * 4, usage: usage });
  }

  function createComputeBindGroup(pipeline, entries) {
    return device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: entries.map(function (entry) {
        return { binding: entry[0], resource: { buffer: entry[1] } };
      })
    });
  }

  function createResources() {
    var rect = sidebar.getBoundingClientRect();
    var pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));

    gridWidth = clamp(Math.round(rect.width / 3), 64, 112);
    gridHeight = clamp(Math.round(gridWidth * rect.height / Math.max(rect.width, 1)), 48, 288);
    var cellCount = gridWidth * gridHeight;
    var stateSize = cellCount * 16;
    var scalarSize = cellCount * 4;
    var storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

    if (stateBuffers) {
      stateBuffers.forEach(function (buffer) { buffer.destroy(); });
      pressureBuffers.forEach(function (buffer) { buffer.destroy(); });
      divergenceBuffer.destroy();
    }

    stateBuffers = [createBuffer(stateSize, storageUsage), createBuffer(stateSize, storageUsage)];
    pressureBuffers = [createBuffer(scalarSize, storageUsage), createBuffer(scalarSize, storageUsage)];
    divergenceBuffer = createBuffer(scalarSize, storageUsage);
    currentState = 0;

    bindGroups = {
      forces: [],
      advect: [],
      divergence: [],
      pressure: [],
      gradient: [[], []],
      render: []
    };

    for (var stateIndex = 0; stateIndex < 2; stateIndex += 1) {
      var otherState = 1 - stateIndex;
      var stateEntries = [[0, uniformBuffer], [1, stateBuffers[stateIndex]], [2, stateBuffers[otherState]]];
      bindGroups.forces[stateIndex] = createComputeBindGroup(pipelines.forces, stateEntries);
      bindGroups.advect[stateIndex] = createComputeBindGroup(pipelines.advect, stateEntries);
      bindGroups.divergence[stateIndex] = createComputeBindGroup(pipelines.divergence, [
        [0, uniformBuffer], [1, stateBuffers[stateIndex]], [3, divergenceBuffer], [5, pressureBuffers[0]]
      ]);

      for (var pressureIndex = 0; pressureIndex < 2; pressureIndex += 1) {
        bindGroups.gradient[stateIndex][pressureIndex] = createComputeBindGroup(pipelines.gradient, [
          [0, uniformBuffer], [1, stateBuffers[stateIndex]], [2, stateBuffers[otherState]], [4, pressureBuffers[pressureIndex]]
        ]);
      }

      bindGroups.render[stateIndex] = device.createBindGroup({
        layout: pipelines.render.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: stateBuffers[stateIndex] } }
        ]
      });
    }

    for (var pressureState = 0; pressureState < 2; pressureState += 1) {
      bindGroups.pressure[pressureState] = createComputeBindGroup(pipelines.pressure, [
        [0, uniformBuffer], [3, divergenceBuffer], [4, pressureBuffers[pressureState]], [5, pressureBuffers[1 - pressureState]]
      ]);
    }

    resizePending = false;
  }

  function updateUniforms(dt) {
    var rect = sidebar.getBoundingClientRect();
    var localX = pointer.clientX - rect.left;
    var localY = pointer.clientY - rect.top;
    var active = localX >= 0 && localY >= 0 && localX <= rect.width && localY <= rect.height;
    var data = new ArrayBuffer(48);
    var integers = new Uint32Array(data);
    var floats = new Float32Array(data);

    integers[0] = gridWidth;
    integers[1] = gridHeight;
    floats[2] = dt;
    floats[3] = simulationTime;
    floats[4] = active ? localX / Math.max(rect.width, 1) : -10;
    floats[5] = active ? localY / Math.max(rect.height, 1) : -10;
    floats[6] = active ? pointer.velocityX : 0;
    floats[7] = active ? pointer.velocityY : 0;
    floats[8] = 24 / Math.max(rect.width, 1);
    floats[9] = 24 / Math.max(rect.height, 1);

    device.queue.writeBuffer(uniformBuffer, 0, data);
  }

  function dispatch(pass, pipeline, bindGroup) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(gridWidth / 8), Math.ceil(gridHeight / 8));
  }

  function simulateAndRender(dt) {
    simulationTime += dt;
    var pointerDecay = Math.exp(-12 * dt);
    pointer.velocityX *= pointerDecay;
    pointer.velocityY *= pointerDecay;
    updateUniforms(dt);

    var encoder = device.createCommandEncoder();
    var compute = encoder.beginComputePass();

    dispatch(compute, pipelines.forces, bindGroups.forces[currentState]);
    currentState = 1 - currentState;
    dispatch(compute, pipelines.advect, bindGroups.advect[currentState]);
    currentState = 1 - currentState;
    dispatch(compute, pipelines.divergence, bindGroups.divergence[currentState]);

    var pressureState = 0;
    for (var iteration = 0; iteration < 50; iteration += 1) {
      dispatch(compute, pipelines.pressure, bindGroups.pressure[pressureState]);
      pressureState = 1 - pressureState;
    }

    dispatch(compute, pipelines.gradient, bindGroups.gradient[currentState][pressureState]);
    currentState = 1 - currentState;
    compute.end();

    var render = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store"
      }]
    });
    render.setPipeline(pipelines.render);
    render.setBindGroup(0, bindGroups.render[currentState]);
    render.draw(3);
    render.end();

    device.queue.submit([encoder.finish()]);
  }

  function frame(timestamp) {
    if (!lastFrame) lastFrame = timestamp;
    var elapsed = (timestamp - lastFrame) / 1000;

    if (resizePending) createResources();
    if (elapsed >= 1 / 30) {
      lastFrame = timestamp;
      if (!document.hidden && !reducedMotion.matches && sidebarVisible) {
        simulateAndRender(Math.min(elapsed, 1 / 20));
      }
    }
    window.requestAnimationFrame(frame);
  }

  function handlePointerMove(event) {
    var now = performance.now();
    if (pointer.previousTime) {
      var elapsed = Math.max((now - pointer.previousTime) / 1000, 0.001);
      var rect = sidebar.getBoundingClientRect();
      pointer.velocityX = clamp((event.clientX - pointer.previousX) / Math.max(rect.width, 1) / elapsed, -1, 1);
      pointer.velocityY = clamp((event.clientY - pointer.previousY) / Math.max(rect.height, 1) / elapsed, -1, 1);
    }

    pointer.clientX = event.clientX;
    pointer.clientY = event.clientY;
    pointer.previousX = event.clientX;
    pointer.previousY = event.clientY;
    pointer.previousTime = now;
  }

  function handlePointerEnd(event) {
    if (event.pointerType === "mouse") return;
    pointer.clientX = -1;
    pointer.clientY = -1;
    pointer.velocityX = 0;
    pointer.velocityY = 0;
  }

  async function initialize() {
    var adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;

    device = await adapter.requestDevice();
    context = canvas.getContext("webgpu");
    if (!context) return;

    format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device: device, format: format, alphaMode: "premultiplied" });
    uniformBuffer = createBuffer(48, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

    var simulationModule = device.createShaderModule({ code: simulationShader });
    var renderModule = device.createShaderModule({ code: renderShader });
    var pipelineLayout = "auto";

    var createdPipelines = await Promise.all([
      device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: simulationModule, entryPoint: "forces" } }),
      device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: simulationModule, entryPoint: "advect" } }),
      device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: simulationModule, entryPoint: "computeDivergence" } }),
      device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: simulationModule, entryPoint: "solvePressure" } }),
      device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: simulationModule, entryPoint: "subtractGradient" } }),
      device.createRenderPipelineAsync({
        layout: pipelineLayout,
        vertex: { module: renderModule, entryPoint: "vertexMain" },
        fragment: {
          module: renderModule,
          entryPoint: "fragmentMain",
          targets: [{
            format: format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }
            }
          }]
        },
        primitive: { topology: "triangle-list" }
      })
    ]);

    pipelines = {
      forces: createdPipelines[0],
      advect: createdPipelines[1],
      divergence: createdPipelines[2],
      pressure: createdPipelines[3],
      gradient: createdPipelines[4],
      render: createdPipelines[5]
    };

    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerup", handlePointerEnd, { passive: true });
    document.addEventListener("pointercancel", handlePointerEnd, { passive: true });
    window.addEventListener("blur", function () { pointer.clientX = -1; pointer.clientY = -1; });

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        sidebarVisible = entries[0].isIntersecting;
      }).observe(sidebar);
    }

    if (window.ResizeObserver) {
      new ResizeObserver(function () { resizePending = true; }).observe(sidebar);
    } else {
      window.addEventListener("resize", function () { resizePending = true; });
    }

    createResources();
    window.requestAnimationFrame(frame);
  }

  initialize().catch(function (error) {
    console.warn("Sidebar ink could not start:", error);
  });
}());
