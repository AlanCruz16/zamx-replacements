import React from 'react';
import Image from 'next/image';
import { WebGLShader } from '@/components/ui/web-gl-shader';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] w-full flex items-center justify-center overflow-hidden pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)]">
      <WebGLShader />

      <div className="absolute top-[calc(2rem+var(--safe-top))] md:top-[calc(3rem+var(--safe-top))] z-20">
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
