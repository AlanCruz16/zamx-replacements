'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const user = useQuery(api.users.current);
  const updateProfile = useMutation(api.users.updateProfile);

  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill full name if available
  useEffect(() => {
    if (user && user.fullName && user.fullName !== 'Sin nombre') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFullName(user.fullName);
    }
  }, [user]);

  // If user already completed onboarding, redirect them to dashboard
  useEffect(() => {
    if (user && user.companyName !== 'Pendiente') {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !companyName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        companyName: companyName.trim(),
        phone: phone.trim() || undefined,
      });
      // Redirect to main dashboard after saving
      router.push('/');
    } catch (error) {
      console.error('Failed to update profile:', error);
      setIsSubmitting(false);
    }
  };

  if (user === undefined) {
    return (
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl w-full p-8 flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-white w-8 h-8" />
      </div>
    );
  }

  // Prevent flashing the form if they are already onboarded and about to redirect
  if (user && user.companyName !== 'Pendiente') {
    return null;
  }

  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl w-full p-8 md:p-10">
      <div className="mb-8 text-center">
        <h1 className="text-white text-2xl font-bold mb-2">
          Bienvenido a la aplicación de remplazos
        </h1>
        <p className="text-white/70 text-sm">
          Por favor, completa tu información para configurar tu cuenta y personalizar tus
          cotizaciones.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-1">
          <label htmlFor="fullName" className="text-white/90 text-sm font-medium">
            Nombre Completo <span className="text-red-400">*</span>
          </label>
          <input
            id="fullName"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:border-brand-light focus:ring-1 focus:ring-brand-light transition-all"
            placeholder="Ej. Juan Pérez"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="companyName" className="text-white/90 text-sm font-medium">
            Empresa <span className="text-red-400">*</span>
          </label>
          <input
            id="companyName"
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:border-brand-light focus:ring-1 focus:ring-brand-light transition-all"
            placeholder="Nombre de tu compañía"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="phone" className="text-white/90 text-sm font-medium">
            Teléfono <span className="text-white/50 text-xs font-normal">(Opcional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:border-brand-light focus:ring-1 focus:ring-brand-light transition-all"
            placeholder="Ej. +52 55 1234 5678"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !fullName.trim() || !companyName.trim()}
          className="w-full bg-[#004b87] hover:bg-[#0066b3] text-white font-medium py-2.5 rounded-lg border-none shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center mt-4"
        >
          {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Guardar y Continuar'}
        </button>
      </form>
    </div>
  );
}
