---
layout: post
title: Physics
---


# Part 1: Introduction and Mathematical Foundations

## 1. Physics Simulations in Computer Graphics

물리 시뮬레이션은 컴퓨터 그래픽스에서 매우 중요한 역할을 합니다. 게임이나 영화에서 현실적인 움직임을 표현하기 위해 물리 시뮬레이션이 필수적으로 사용됩니다.

### 물리 시뮬레이션의 주요 응용 분야
1. **Games (게임)**: 캐릭터의 움직임이나 물체 간의 상호작용을 사실적으로 표현합니다.
2. **Films (영화)**: CG로 구현된 물체나 자연현상을 현실감 있게 표현하는 데 사용됩니다.
3. **Virtual Reality (가상 현실)**: 사용자와 환경 간의 상호작용을 자연스럽게 만듭니다.

물리 기반 모델링의 목표는 현실 세계의 물리적 특성을 가상 환경에서 정밀하게 재현하는 것입니다.

## 2. Mathematics for Physics Simulation

물리 시뮬레이션을 이해하려면 먼저 수학적 기초를 잘 이해해야 합니다. 물리 시뮬레이션에서는 주로 **Vectors (벡터)**, **Matrices (행렬)**, 그리고 **Differential Equations (미분 방정식)**이 자주 사용됩니다.

### Vectors and Matrices (벡터와 행렬)
벡터는 공간에서의 위치나 방향을 나타내는 데 사용됩니다. 행렬은 벡터를 변환하는 수단으로, 회전, 이동, 크기 조정 등의 작업에 사용됩니다.

- 벡터는 일반적으로 다음과 같이 표기됩니다:
  \[
  \vec{v} = [v_x, v_y, v_z]
  \]
  
- 행렬은 벡터에 변형을 가할 수 있습니다. 예를 들어, 2D 회전 행렬은 다음과 같습니다:
  \[
  R(\theta) = 
  \begin{bmatrix}
  \cos(\theta) & -\sin(\theta) \\
  \sin(\theta) & \cos(\theta)
  \end{bmatrix}
  \]

### Differential Equations (미분 방정식)
물리 시뮬레이션에서 **미분 방정식 (Differential Equations)**은 물체의 속도나 가속도를 계산하는 데 사용됩니다. 뉴턴의 운동 법칙 \(F = ma\)를 미분 방정식으로 표현할 수 있습니다.

#### 예시:
만약 물체의 위치가 시간에 따라 변한다고 가정하면, 그 물체의 속도는 위치의 시간에 대한 1차 미분으로 표현됩니다:
\[
v(t) = \frac{dx(t)}{dt}
\]

가속도는 속도의 시간에 대한 1차 미분, 혹은 위치의 시간에 대한 2차 미분으로 표현됩니다:
\[
a(t) = \frac{dv(t)}{dt} = \frac{d^2x(t)}{dt^2}
\]

### Linear Algebra (선형대수)
선형대수는 물리 시뮬레이션에서 매우 중요한 역할을 합니다. **행렬 (Matrix)**와 **벡터 (Vector)**는 물체의 움직임과 변형을 표현하는 데 사용되며, 시뮬레이션 환경에서 여러 물체의 상호작용을 계산하는 데 사용됩니다.

## 3. Coordinate Systems and Transformations

시뮬레이션에서 물체는 **Global Coordinate System (글로벌 좌표계)**와 **Local Coordinate System (로컬 좌표계)**에서 표현됩니다. 글로벌 좌표계는 전체 시뮬레이션 환경을 나타내며, 로컬 좌표계는 특정 물체의 위치와 방향을 나타냅니다.

### Global vs. Local Coordinate Systems (글로벌 vs. 로컬 좌표계)
- **Global Coordinate System (글로벌 좌표계)**: 시뮬레이션 환경 전체를 기준으로 한 좌표계입니다. 모든 물체는 이 좌표계를 기준으로 위치가 결정됩니다.
- **Local Coordinate System (로컬 좌표계)**: 각 물체에 대한 고유한 좌표계로, 물체의 위치와 방향이 이 좌표계를 기준으로 표현됩니다.

### Rotation Matrices (회전 행렬)
물체의 회전은 주로 **Rotation Matrix (회전 행렬)**로 표현됩니다. 3D 공간에서의 회전은 **Quaternions (쿼터니언)**으로도 표현할 수 있습니다.

#### 예시:
만약 물체가 \(\theta\)만큼 회전한다고 하면, 그 물체의 회전 행렬은 다음과 같이 정의됩니다:
\[
R(\theta) =
\begin{bmatrix}
\cos(\theta) & -\sin(\theta) \\
\sin(\theta) & \cos(\theta)
\end{bmatrix}
\]

이 회전 행렬은 물체의 위치 벡터에 곱해져, 회전 후의 새로운 위치를 계산할 수 있습니다.

---
