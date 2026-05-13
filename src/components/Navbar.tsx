import { useState } from 'react';
import { Sun, Moon, User, LogOut, UserCircle } from 'lucide-react';

interface NavbarProps {
  isLoggedIn: boolean;
  userName: string;
  isDark: boolean;
  onToggleDark: () => void;
  onLoginClick: () => void;
  onLogout: () => void;
}

export function Navbar({ isLoggedIn, userName, isDark, onToggleDark, onLoginClick, onLogout }: NavbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <nav className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-slate-200 shadow-xs dark:bg-slate-800 dark:border-slate-700">
      <div className="flex items-center gap-2 min-w-0">
        <img src={isDark ? '/favicon-dark.png' : '/favicon.png'} alt="Wahala Sorter" className="size-7 sm:size-8 shrink-0" />
        <span className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">Wahala Sorter</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          onClick={onToggleDark}
          className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="size-4 sm:size-5" /> : <Moon className="size-4 sm:size-5" />}
        </button>
        {isLoggedIn ? (
          <div
            className="relative"
            onMouseEnter={() => setDropdownOpen(true)}
            onMouseLeave={() => setDropdownOpen(false)}
          >
            <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <User className="size-5 text-slate-600 dark:text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{userName || 'User'}</span>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <UserCircle className="size-4" />
                  Profile
                </button>
                <hr className="border-slate-200 dark:border-slate-700" />
                <button
                  onClick={onLogout}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
                >
                  <LogOut className="size-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onLoginClick}
            className="px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors whitespace-nowrap"
          >
            Login
          </button>
        )}
      </div>
    </nav>
  );
}
