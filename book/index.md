---
layout: post
title: Physics
---

<head>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head>

# 1. Stable Fluids 개요

Stable Fluids는 1999년 Jos Stam에 출판된 논문이며 저명한 컴퓨터 그래픽스 학회인 SIGGRAPH에서 발표된 실시간 유체 시뮬레이션 기법을 다루고 있습니다. 전통적으로 유체 시뮬레이션은 복잡한 수치해석 방정식을 풀어야 하며, 매우 세밀한 시간 간격과 공간 격자를 사용해야만 안정적이고 정확한 결과를 얻을 수 있었습니다. 하지만 이렇게 정확도를 높이려다 보면 계산 비용이 급격하게 증가하여 실시간 시뮬레이션이 사실상 불가능해지는 문제가 있었습니다.

Jos Stam은 이러한 문제를 해결하기 위해 Semi-Lagrangian 기법과 projection(압력 보정) 방식을 조합함으로써 time step이 커져도(상대적으로 적은 계산량으로도) 시뮬레이션이 폭발(explode)하지 않고 안정적으로 진행될 수 있는 알고리즘을 고안했습니다. 이 알고리즘은 물리적으로 정확한 결과를 제공하지는 않지만, 시각적으로 만족도가 높고 연산량 대비 매우 안정적이라는 장점 덕분에 컴퓨터 그래픽스 분야에서 널리 쓰이게 되었습니다.

* 안정성(Stable): 시간 스텝을 크게 해도 수치 오차로 인해 발산하는 문제를 억제합니다.
* 간단한 구현(Simple Implementation): 서로 다른 수치 알고리즘을 단계별(Advection → Diffusion → Projection)로 나누어 처리하므로, 코드 구조가 비교적 간단합니다.
* 실시간성(Real-time): GPU 가속 및 병렬 처리를 통해 낮은 해상도에서 실시간에 가까운 시뮬레이션이 가능합니다.

Stable Fluids는 게임 엔진, 그래픽스 소프트웨어, 교육용 시뮬레이션 툴 등에서 연기(Smoke), 물의 흐름(Water Flow) 등의 시각적 효과를 구현하는 데 널리 활용됩니다. 
Stable Fluids 이후, 많은 연구자들이 Semi-Lagrangian 방식이나 압력 보정(Projection) 기법을 더욱 정교화함으로써, 물리적으로 더욱 정확하고 다양한 종류(Multi-phase)의 유체나 열전달(Thermal Transfer) 등이 포함된 고도화된 시뮬레이션으로 발전시켰습니다. Jos Stam의 연구는 이러한 후속 연구의 **초석(Foundation)**이 되었다는 점에서 여전히 큰 의의를 지니고 있습니다.

앞으로 이어지는 섹션에서는 Stable Fluids 알고리즘의 세부 과정을 단계별로 살펴보고, 이를 구현하기 위한 이론적 배경 및 예제 코드를 살펴볼 예정입니다. 다음 장에서는 유체 역학의 기본 방정식과 수치해석 기법에 대해 간단히 정리해 보겠습니다.


# 2. 수학적 배경 (Mathematical Background)

## 2-1. 유체 역학의 기본 방정식: Navier-Stokes 식

유체 역학의 핵심이 되는 방정식은 바로 **Navier-Stokes** 식입니다. 이 방정식은 유체의 운동(속도장 \(\mathbf{v}\))을 지배하며, 유체가 받는 외력, 점성(Viscosity), 압력(Pressure) 등에 의해 어떻게 변하는지를 수학적으로 표현합니다. 특히 **Stable Fluids** 기법에서도 Navier-Stokes 식을 근본적인 이론적 토대로 삼고 있습니다.

### Navier-Stokes 식 (Incompressible Fluid)

불압축성(Incompressible) 유체를 가정하면, 유체의 밀도(\(\rho\))를 상수로 둘 수 있습니다. 이때, 2D 또는 3D 공간에서의 Navier-Stokes 식은 다음과 같은 형태로 나타낼 수 있습니다.

\[
\frac{\partial \mathbf{v}}{\partial t} 
+ (\mathbf{v} \cdot \nabla)\mathbf{v} 
= -\frac{1}{\rho}\nabla p 
+ \nu \nabla^2 \mathbf{v} 
+ \mathbf{f},
\]

- \(\mathbf{v}\): 속도장(velocity field)  
- \(t\): 시간(time)  
- \(p\): 압력(pressure)  
- \(\rho\): 밀도(density, 여기서는 상수로 가정)  
- \(\nu\): 점성 계수(kinematic viscosity)  
- \(\mathbf{f}\): 외력(중력, 외부에서 가해지는 힘 등)

추가로 불압축성 조건을 만족하기 위해서는 **연속 방정식(Continuity Equation)**:

\[
\nabla \cdot \mathbf{v} = 0
\]

이 충족되어야 합니다. 이는 “어떤 유체의 부피 요소에서 질량이 새어나가거나 스스로 생기지 않는다”는 불압축성 조건을 의미합니다.

---

### 항(terms)별 의미

1. **\(\frac{\partial \mathbf{v}}{\partial t}\)** (Local Acceleration, 국소적 가속도)  
   - 시간에 따른 유체 속도장 변화량을 나타냅니다.

2. **\((\mathbf{v} \cdot \nabla)\mathbf{v}\)** (Advective Acceleration, 이류 항)  
   - 유체 내부에서 속도장이 공간적으로 변하면서, 유체 입자가 이동 경로를 따라 추가로 받게 되는 가속도를 의미합니다.

3. **\(-\frac{1}{\rho}\nabla p\)** (Pressure Gradient, 압력 기울기 항)  
   - 공간상에서 발생하는 압력의 차이로 인해 유체가 받게 되는 힘에 해당합니다.

4. **\(\nu \nabla^2 \mathbf{v}\)** (Viscous Diffusion, 점성 항)  
   - 유체의 점성으로 인해 속도가 균등하게 퍼져 나가거나(작아지거나) 하는 현상을 수치적으로 표현합니다. \(\nu\)는 점성 계수입니다.

5. **\(\mathbf{f}\)** (External Force, 외력 항)  
   - 중력, 바람, 사용자 정의 힘 등 외부에서 가해지는 모든 힘을 통칭합니다.

---

### Stable Fluids에서의 활용

- **Advection(이류)와 Diffusion(확산)** 단계에서 \((\mathbf{v} \cdot \nabla)\mathbf{v}\) 항과 \(\nu \nabla^2 \mathbf{v}\) 항을 각각 분리하여 처리함으로써, Navier-Stokes 식을 수치적으로 풀기 쉽게 만들어줍니다.  
- **Projection(압력 보정)** 단계에서 \(\nabla \cdot \mathbf{v} = 0\) 조건을 만족시켜, 결과적으로 물이 부풀어 오르거나 갑자기 압축되는 등의 비물리적 현상이 발생하지 않도록 합니다.

앞으로 이어지는 섹션에서는 Navier-Stokes 식을 어떻게 **수치해석(Numerical Methods)** 기법으로 풀어나가고, 어떻게 단계를 분리하여 구현하는지 살펴볼 예정입니다.
