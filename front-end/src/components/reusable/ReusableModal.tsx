'use client';

import React, { useEffect, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface ReusableModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  showCloseIcon?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | '8xl';
  overflowAuto?: boolean;
  titleClassName?: string;
  maxHeight?: string;
}

const maxWidthClasses: Record<string, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
  '6xl': 'sm:max-w-6xl',
  '7xl': 'sm:max-w-7xl',
  '8xl': 'max-w-[90%] sm:max-w-[80%]',
};

export default function ReusableModal({
  open,
  overflowAuto = false,
  onClose,
  title,
  description,
  children,
  showCloseIcon = true,
  maxWidth = 'lg',
  maxHeight,
  titleClassName,
}: ReusableModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      const previousActiveElement = document.activeElement as HTMLElement;
      modalRef.current?.focus();

      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
        previousActiveElement?.focus?.();
      };
    }
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop with smooth fade */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Modal Content with smooth scale & fade */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`relative z-10 w-full ${maxWidthClasses[maxWidth]} bg-white rounded-xl shadow-2xl focus:outline-none ${maxHeight ?? ''} max-h-[90vh] flex flex-col border border-zinc-200/80 overflow-hidden`}
          >
            {/* Header */}
            {title && (
              <div className="sticky top-0 z-10 flex justify-between items-center border-b border-zinc-100 px-6 py-4 bg-white/95 backdrop-blur-sm rounded-t-xl">
                <div>
                  <h2 className={titleClassName ?? 'text-base font-semibold text-zinc-900'}>{title}</h2>
                  {description && <h4 className="text-xs text-zinc-500 mt-0.5">{description}</h4>}
                </div>
                {showCloseIcon && (
                  <button
                    type="button"
                    aria-label="Close"
                    className="p-1.5 rounded-lg cursor-pointer text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors focus:outline-none"
                    onClick={onClose}
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Scrollable Content */}
            <div
              className={`overflow-y-auto modal-scroll px-6 py-5 ${overflowAuto ? 'flex-grow' : ''}`}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
