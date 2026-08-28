'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { messagesFor, resolveLanguage } from '@/lib/messages';

// Los tres campos se pintan igual. `text-base` no es decorativo: iOS hace zoom
// sobre cualquier campo cuya letra baje de 16px y no lo deshace solo.
const CAMPO =
  'w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 text-base text-white placeholder-white/40 focus:outline-none focus:border-brand-light focus:ring-1 focus:ring-brand-light transition-all';

export default function OnboardingPage() {
  const router = useRouter();
  const user = useQuery(api.users.current);
  const updateProfile = useMutation(api.users.updateProfile);

  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // El alta es la primera pantalla del Customer, y hasta el ticket 20 era la
  // única que no miraba su idioma. Quien llega con la cuenta ya en inglés
  // rellenaba un formulario en español antes de ver el chat.
  const language = resolveLanguage(user?.preferredLanguage);
  const t = messagesFor(language).onboarding;

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
        <h1 className="text-white text-2xl font-bold mb-2">{t.title}</h1>
        <p className="text-white/70 text-sm">{t.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-1">
          <label htmlFor="fullName" className="text-white/90 text-sm font-medium">
            {t.fullNameLabel} <span className="text-red-400">*</span>
          </label>
          <input
            id="fullName"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={CAMPO}
            placeholder={t.fullNamePlaceholder}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="companyName" className="text-white/90 text-sm font-medium">
            {t.companyLabel} <span className="text-red-400">*</span>
          </label>
          <input
            id="companyName"
            type="text"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className={CAMPO}
            placeholder={t.companyPlaceholder}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="phone" className="text-white/90 text-sm font-medium">
            {t.phoneLabel}{' '}
            <span className="text-white/50 text-xs font-normal">{t.phoneOptional}</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={CAMPO}
            placeholder={t.phonePlaceholder}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !fullName.trim() || !companyName.trim()}
          className="w-full bg-[#004b87] hover:bg-[#0066b3] text-white font-medium py-2.5 rounded-lg border-none shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center mt-4"
        >
          {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : t.submit}
        </button>
      </form>
    </div>
  );
}
