import { useState, useRef } from 'react';
import { X } from 'lucide-react';

interface LoginFormProps {
  onClose: () => void;
  onLogin: (name?: string) => void;
  message?: string;
}

export function LoginForm({ onClose, onLogin, message }: LoginFormProps) {
  const [isRegister, setIsRegister] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = isRegister ? nameRef.current?.value || '' : undefined;
    onLogin(name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 relative dark:bg-slate-800 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors dark:hover:text-slate-300"
        >
          <X className="size-5" />
        </button>

        <h2 className="text-xl font-semibold text-slate-800 mb-1 dark:text-slate-100">
          {isRegister ? 'Create Account' : 'Login'}
        </h2>
        {message && (
          <p className="text-sm text-slate-500 mb-6 dark:text-slate-400">{message}</p>
        )}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {isRegister && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">Full name</label>
              <input
                ref={nameRef}
                id="name"
                type="text"
                placeholder="Enter full name"
                className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:placeholder-slate-400"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:placeholder-slate-400"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200 dark:placeholder-slate-400"
            />
          </div>

          <button
            type="submit"
            className="mt-2 w-full py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
          >
            {isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-sm text-center text-slate-500 dark:text-slate-400">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}
