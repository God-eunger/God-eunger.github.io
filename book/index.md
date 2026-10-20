---
layout: post
title: Physics
---

<head>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head>

# 1. Stable Fluids Overview

Stable Fluids, published by Jos Stam at SIGGRAPH in 1999, presents a technique for real-time fluid simulation. Traditionally, fluid simulation required solving complex numerical analysis equations, and stable, accurate results could be obtained only by using very fine time intervals and spatial grids. However, increasing accuracy in this way caused computational costs to rise sharply, making real-time simulation practically impossible.

To solve this problem, Jos Stam combined the Semi-Lagrangian technique with a projection (pressure correction) method and devised an algorithm that allows the simulation to proceed stably without exploding even when the time step is large (with a relatively small amount of computation). Although this algorithm does not provide physically accurate results, it became widely used in computer graphics because it produces visually satisfactory results and is highly stable relative to its computational cost.

* Stability: Suppresses the problem of divergence caused by numerical errors even when the time step is large.
* Simple Implementation: Because different numerical algorithms are processed step by step (Advection → Diffusion → Projection), the code structure is relatively simple.
* Real-time: GPU acceleration and parallel processing make simulation close to real time possible at low resolutions.

Stable Fluids is widely used in game engines, graphics software, educational simulation tools, and other applications to implement visual effects such as smoke and water flow.
After Stable Fluids, many researchers further refined the Semi-Lagrangian approach and pressure correction (Projection) techniques, developing more advanced simulations that are physically more accurate and include multiphase fluids and heat transfer. Jos Stam's research remains significant because it became the **foundation** for these subsequent studies.

In the sections that follow, we will examine the details of the Stable Fluids algorithm step by step and review the theoretical background and example code needed to implement it. The next chapter briefly reviews the basic equations of fluid mechanics and numerical analysis techniques.


# 2. Mathematical Background

## 2-1. Basic Equations of Fluid Mechanics: Navier-Stokes Equation

The central equation of fluid mechanics is the **Navier-Stokes** equation. This equation governs the motion of a fluid (the velocity field \(\mathbf{v}\)) and mathematically expresses how the fluid changes under external forces, viscosity, pressure, and other factors. In particular, the **Stable Fluids** method also uses the Navier-Stokes equation as its fundamental theoretical basis.

### Navier-Stokes Equation (Incompressible Fluid)

Assuming an incompressible fluid, the fluid density (\(\rho\)) can be treated as a constant. In 2D or 3D space, the Navier-Stokes equation can then be written in the following form.

\\[
\frac{\partial \mathbf{v}}{\partial t} + (\mathbf{v} \cdot \nabla)\mathbf{v} = -\frac{1}{\rho}\nabla p + \nu \nabla^2 \mathbf{v} + \mathbf{f},
\\]

- \\(\mathbf{v}\\): velocity field
- \\(t\\): time
- \\(p\\): pressure
- \\(\rho\\): density (assumed to be constant here)
- \\(\nu\\): kinematic viscosity
- \\(\mathbf{f}\\): external force (gravity, externally applied forces, etc.)

Additionally, to satisfy the incompressibility condition, the **Continuity Equation** must hold:

\\[
\nabla \cdot \mathbf{v} = 0
\\]

This means that mass does not leak from or spontaneously appear in a volume element of the fluid, which is the incompressibility condition.

---

### Meaning of Each Term

1. **\\(\frac{\partial \mathbf{v}}{\partial t}\\)** (Local Acceleration)
   - Represents the change in the fluid velocity field over time.

2. **\\((\mathbf{v} \cdot \nabla)\mathbf{v}\\)** (Advective Acceleration)
   - Represents the acceleration additionally experienced by a fluid particle as the velocity field changes spatially within the fluid and the particle follows its path of motion.

3. **\\(-\frac{1}{\rho}\nabla p\\)** (Pressure Gradient)
   - Corresponds to the force experienced by the fluid due to differences in pressure occurring in space.

4. **\\(\nu \nabla^2 \mathbf{v}\\)** (Viscous Diffusion)
   - Numerically expresses the phenomenon in which velocity spreads out uniformly (or decreases) due to the viscosity of the fluid. \(\nu\) is the viscosity coefficient.

5. **\\(\mathbf{f}\\)** (External Force)
   - Refers collectively to all forces applied externally, including gravity, wind, and user-defined forces.

---

### Use in Stable Fluids

- **Advection** and **Diffusion** stages separately process the terms \\((\mathbf{v} \cdot \nabla)\mathbf{v}\\) and \\(\nu \nabla^2 \mathbf{v}\\), making the Navier-Stokes equation easier to solve numerically.
- The **Projection (pressure correction)** stage satisfies \\(\nabla \cdot \mathbf{v} = 0\\), preventing nonphysical phenomena such as water swelling or suddenly compressing.


## 2-2. Conservation Equations

The most important conservation laws in fluid mechanics broadly include **mass conservation (Continuity)**, **momentum conservation**, and **energy conservation**. Among these, the **Stable Fluids** algorithm assumes an incompressible fluid, so it focuses primarily on **mass conservation**.

---

### Mass Conservation (Continuity Equation)

For an incompressible fluid, the density (\\(\rho\\)) is assumed not to change with time or space. Therefore, the following **Continuity Equation** holds.

\\[
\nabla \cdot \mathbf{v} = 0
\\]

This means that the mass (or volume) does not increase or decrease while the fluid flows. In other words, it is the concept that “as much fluid leaves a point as enters it.”

- \\(\mathbf{v}\\): velocity field
- \\(\nabla \cdot \mathbf{v}\\): divergence, which in three dimensions is calculated in the form \\(\frac{\partial v_x}{\partial x} + \frac{\partial v_y}{\partial y} + \frac{\partial v_z}{\partial z}\\).

---

### Momentum Conservation

The **Navier-Stokes equation** examined in the preceding **2-1** is the form obtained by applying the law of momentum conservation to a fluid. The motion state of a fluid is determined by various factors, including external force (\\(\mathbf{f}\\)), pressure gradient (\\(\nabla p\\)), and viscosity (\\(\nu \nabla^2 \mathbf{v}\\)).




## 2-3. Meaning of the Velocity Field and Pressure

In fluid simulation, the **velocity field** and **pressure** are the most important physical quantities. Interpreting and calculating these two physical quantities correctly is essential for obtaining simulation results that resemble real fluid flow.

---

### Velocity Field

- **Definition**: A function representing the velocity (\\(\mathbf{v}\\)) at an arbitrary position \\((x, y, z)\\) in the fluid. In a 2D simulation, it is expressed as \\(\mathbf{v} = (v_x, v_y)\\), and in a 3D simulation, as \\(\mathbf{v} = (v_x, v_y, v_z)\\).
- **Role**:
  - Determines where and how quickly fluid particles move.
  - In the **Advection** stage, it is referenced when calculating how scalar values such as concentration or temperature move.
- **From a numerical analysis perspective**:
  - A grid is generally used to store velocity at each grid cell or at the boundaries between cells.
  - Because numerical errors such as rounding and interpolation can easily occur, it is important to determine appropriate time steps and spatial resolution.

---

### Pressure

- **Definition**: The magnitude of the force that varies according to position inside a fluid (force acting per unit area).
- **Role**:
  - It has a major influence on whether the fluid accelerates in a particular direction or stops, and is a key element in satisfying the **Continuity Equation** (\\(\nabla \cdot \mathbf{v} = 0\\)).
  - In the **Projection (pressure correction)** stage, the pressure required at each point is calculated to remove divergence from the velocity field, and the final velocity field is modified.
- **From a numerical analysis perspective**:
  - The pressure of each grid cell is obtained by solving the “Pressure Poisson Equation,” after which the velocity field is updated.
  - Simulation results can vary greatly depending on how the Boundary Condition is set. For example, at a **solid boundary**, pressure must act so that the velocity becomes 0, while at an **open boundary**, it must be set so that the fluid can flow out freely.

In this way, the **velocity field** and **pressure** are the most important elements determining the flow and shape of a fluid, and they must be considered when numerically solving the Navier-Stokes and continuity equations.
