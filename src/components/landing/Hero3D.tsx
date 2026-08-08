"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment } from "@react-three/drei";
import type { Mesh, Group } from "three";

function Orb() {
  const mesh = useRef<Mesh>(null);
  const group = useRef<Group>(null);

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    if (mesh.current) {
      mesh.current.rotation.x = t * 0.12;
      mesh.current.rotation.y = t * 0.18;
    }
    if (group.current) {
      // Ease the whole group toward the pointer for mouse interaction
      group.current.rotation.y += (pointer.x * 0.45 - group.current.rotation.y) * 0.04;
      group.current.rotation.x += (-pointer.y * 0.3 - group.current.rotation.x) * 0.04;
    }
  });

  return (
    <group ref={group}>
      <Float speed={1.6} rotationIntensity={0.4} floatIntensity={1.4}>
        <mesh ref={mesh} scale={1.55}>
          <icosahedronGeometry args={[1, 24]} />
          <MeshDistortMaterial
            color="#5B8CFF"
            emissive="#1a2f7a"
            roughness={0.15}
            metalness={0.85}
            distort={0.38}
            speed={1.6}
          />
        </mesh>
      </Float>
      {/* Orbiting accent shards */}
      <Float speed={2.4} rotationIntensity={1.2} floatIntensity={2}>
        <mesh position={[2.3, 0.7, -0.6]} scale={0.22}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#70E1FF" emissive="#70E1FF" emissiveIntensity={0.6} roughness={0.2} metalness={0.9} />
        </mesh>
      </Float>
      <Float speed={1.9} rotationIntensity={1.4} floatIntensity={1.6}>
        <mesh position={[-2.1, -0.9, 0.4]} scale={0.16}>
          <tetrahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#9B5CFF" emissive="#9B5CFF" emissiveIntensity={0.6} roughness={0.2} metalness={0.9} />
        </mesh>
      </Float>
    </group>
  );
}

/** Floating distorted orb rendered in a transparent WebGL canvas. */
export default function Hero3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      dpr={[1, 1.75]}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 3, 5]} intensity={1.4} color="#5B8CFF" />
      <directionalLight position={[-4, -2, 3]} intensity={0.8} color="#9B5CFF" />
      <pointLight position={[0, 2, 2]} intensity={0.6} color="#70E1FF" />
      <Orb />
      <Environment preset="city" />
    </Canvas>
  );
}
