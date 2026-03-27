# GPGPU Particles Lab - 262k Swarm 🌌

![ezgif-1449c0464c9c7abdaaa](https://github.com/user-attachments/assets/29ac68f0-f266-4ecb-816f-02ac63d162b3)



An interactive, high-performance particle laboratory built with **Three.js** and **GPGPU**, simulating over 260,000 particles in real-time with physics processed entirely on the GPU.

## 🚀 Technologies Used

- **Three.js**: 3D engine for WebGL rendering.
- **GPUComputationRenderer**: Three.js component for parallel physics processing (GPGPU).
- **GLSL (Shaders)**: Custom Vertex and Fragment shaders.
- **EffectComposer**: Post-processing pipeline for advanced visual effects.
- **UnrealBloomPass**: Neon/stellar glow effect.
- **dat.gui**: Interactive panel for real-time parameter adjustment.
- **Vite**: Ultra-fast build tool.

## 🛠️ Techniques and Concepts

### 1. GPGPU Simulation (General-Purpose GPU)

Instead of processing particle movement on the CPU (which would limit performance to only a few thousand particles), this project leverages `GPUComputationRenderer`.

- **Data Textures**: Positions and velocities of 262,144 particles are stored in 512x512 pixel textures (RGBA Float).
- **Compute Shaders**: Every frame, the GPU reads these textures, executes physical logic (attraction, inertia, swirl), and updates the data instantly.

### 2. Dynamic Physics

- **Mouse Attraction**: Particles are attracted to the cursor position, simulating a galactic gravity effect.
- **Swirl**: A torque force is applied around the attraction point, creating organic spiral movements.
- **Inertia/Damping**: Viscosity control that allows for everything from smooth drift to rapid explosions.

### 3. Visuals and Rendering

- **Vertex Shader**: Samples GPGPU textures to position each individual point and adjusts size (`gl_PointSize`) based on distance from the camera.
- **Fragment Shader**: Dynamically calculates color based on particle **velocity**:
  - Slow particles: Cool tones (Cyan).
  - Fast particles: Energetic tones (Magenta/Pink).
- **Stellar Bloom**: Post-processing saturates the lightest colors, creating the sensation that particles emit their own light.

## 🕹️ How to Test

### Prerequisites

- Node.js installed (v18 or superior recommended).

### Step by Step

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/gpgpu-lab.git
   cd gpgpu-lab
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Start the development server:**

   ```bash
   npm run dev
   ```

4. **Access in browser:**
   Open `http://localhost:5173`.

### Interactions

- **Mouse**: Move the cursor over the canvas to attract the swarm.
- **GUI (Side Panel)**:
  - Adjust **Acceleration** and **Force Limit**.
  - Change particle **Size** and **Transparency**.
  - Tweak **Bloom Strength** for more or less glow.
  - Click **Restart Positions** to see the initial explosion again.

---
Developed as a computer graphics and web performance experiment. ✌️
