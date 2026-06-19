import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <SignUp
      routing="path"
      path="/sign-up"
      signInUrl="/sign-in"
      appearance={{
        elements: {
          rootBox: 'w-full mx-auto',
          card: 'bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl w-full',
          headerTitle: 'text-white text-2xl font-bold',
          headerSubtitle: 'text-white/70',
          socialButtonsBlockButton:
            'bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-colors',
          socialButtonsBlockButtonText: 'text-white font-medium',
          socialButtonsBlockButtonArrow: 'text-white',
          dividerLine: 'bg-white/20',
          dividerText: 'text-white/60',
          formFieldLabel: 'text-white/90',
          formFieldInput:
            'bg-black/20 border border-white/10 text-white placeholder-white/40 focus:border-brand-light focus:ring-1 focus:ring-brand-light transition-all',
          formButtonPrimary:
            'bg-[#004b87] hover:bg-[#0066b3] text-white border-none shadow-lg transition-all',
          footerActionText: 'text-white/70',
          footerActionLink: 'text-brand-light hover:text-white transition-colors',
          identityPreviewText: 'text-white',
          identityPreviewEditButton: 'text-brand-light hover:text-white',
          formResendCodeLink: 'text-brand-light hover:text-white',
          formFieldAction: 'text-brand-light hover:text-white',
        },
      }}
    />
  );
}
