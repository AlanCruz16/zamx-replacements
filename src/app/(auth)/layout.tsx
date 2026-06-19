import React from 'react';
import Image from 'next/image';
import { WebGLShader } from '@/components/ui/web-gl-shader';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden">
      <WebGLShader />

      <div className="absolute top-8 md:top-12 z-20">
        <Image
          src="/logo_final.svg"
          alt="Ziehl-Abegg Mexico Logo"
          width={320}
          height={80}
          priority
          className="brightness-0 invert"
        />
      </div>

      <div className="relative z-10 w-full max-w-md p-6 flex flex-col items-center">{children}</div>
    </div>
  );
}
