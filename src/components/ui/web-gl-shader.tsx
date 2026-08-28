'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { cappedPixelRatio, useDecorativeBackground } from '@/lib/decorative-motion';

/**
 * El fondo de las pantallas de acceso (ticket 11 de «usable-on-a-phone»).
 *
 * Es un fragment shader de precisión alta a pantalla completa, y estaba puesto
 * sin condiciones y a la densidad del aparato: en un teléfono 3× son unos tres
 * millones de píxeles de trabajo por fotograma, en la primerísima pantalla que
 * carga cualquiera, pagados en batería y en calor antes de que el Customer haya
 * hecho nada. El otro fondo de este código ya se apagaba por debajo del
 * breakpoint; éste no llegó a recibir la misma regla, y ahora la comparten:
 * `useDecorativeBackground` la dice una sola vez.
 *
 * Donde sí corre, la densidad va con tope. El coste de este shader va con el
 * cuadrado de la densidad y lo que pinta es un degradado sin bordes, que no se
 * ve mejor por rasterizarlo a 3×.
 *
 * Esto es adorno, no fondo: el negro sobre el que se lee la pantalla de acceso
 * lo pinta ahora la pantalla misma, porque si no un teléfono —donde esto no se
 * monta— se quedaba con el wordmark blanco sobre el fondo claro del `body`. Por
 * eso el lienzo va en `z-0` y no en `-z-10`: por detrás de todo quedaría
 * también por detrás de ese negro, que es quien lo taparía.
 */
export function WebGLShader() {
  const backgroundEnabled = useDecorativeBackground();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene | null;
    camera: THREE.OrthographicCamera | null;
    renderer: THREE.WebGLRenderer | null;
    mesh: THREE.Mesh | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uniforms: any;
    animationId: number | null;
  }>({
    scene: null,
    camera: null,
    renderer: null,
    mesh: null,
    uniforms: null,
    animationId: null,
  });

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const { current: refs } = sceneRef;

    const vertexShader = `
      attribute vec3 position;
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform float xScale;
      uniform float yScale;
      uniform float distortion;

      void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
        
        float d = length(p) * distortion;
        
        float rx = p.x * (1.0 + d);
        float gx = p.x;
        float bx = p.x * (1.0 - d);

        float r = 0.05 / abs(p.y + sin((rx + time) * xScale) * yScale);
        float g = 0.05 / abs(p.y + sin((gx + time) * xScale) * yScale);
        float b = 0.05 / abs(p.y + sin((bx + time) * xScale) * yScale);
        
        gl_FragColor = vec4(r, g, b, 1.0);
      }
    `;

    const initScene = () => {
      refs.scene = new THREE.Scene();
      refs.renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
      refs.renderer.setPixelRatio(cappedPixelRatio(window.devicePixelRatio));
      refs.renderer.setClearColor(new THREE.Color(0x000000));

      refs.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

      refs.uniforms = {
        resolution: { value: [window.innerWidth, window.innerHeight] },
        time: { value: 0.0 },
        xScale: { value: 1.0 },
        yScale: { value: 0.5 },
        distortion: { value: 0.05 },
      };

      const position = [
        -1.0, -1.0, 0.0, 1.0, -1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, -1.0, 1.0, 0.0, 1.0, 1.0,
        0.0,
      ];

      const positions = new THREE.BufferAttribute(new Float32Array(position), 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', positions);

      const material = new THREE.RawShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: refs.uniforms,
        side: THREE.DoubleSide,
      });

      refs.mesh = new THREE.Mesh(geometry, material);
      refs.scene.add(refs.mesh);

      handleResize();
    };

    const animate = () => {
      if (refs.uniforms) refs.uniforms.time.value += 0.01;
      if (refs.renderer && refs.scene && refs.camera) {
        refs.renderer.render(refs.scene, refs.camera);
      }
      refs.animationId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      if (!refs.renderer || !refs.uniforms) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      refs.renderer.setSize(width, height, false);
      refs.uniforms.resolution.value = [width, height];
    };

    initScene();
    animate();
    window.addEventListener('resize', handleResize);

    return () => {
      if (refs.animationId) cancelAnimationFrame(refs.animationId);
      window.removeEventListener('resize', handleResize);
      if (refs.mesh) {
        refs.scene?.remove(refs.mesh);
        refs.mesh.geometry.dispose();
        if (refs.mesh.material instanceof THREE.Material) {
          refs.mesh.material.dispose();
        }
      }
      refs.renderer?.dispose();
    };
    // `backgroundEnabled` está en las dependencias porque el canvas no existe
    // hasta que vale `true`: sin él el efecto correría una vez, sin lienzo, y no
    // volvería.
  }, [backgroundEnabled]);

  if (!backgroundEnabled) return null;

  return <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full block z-0" />;
}
