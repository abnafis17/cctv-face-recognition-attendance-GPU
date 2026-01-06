'use client';

import React, { useEffect, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { max } from 'date-fns';

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
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      const previousActiveElement = document.activeElement as HTMLElement;
      modalRef.current?.focus();

      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
        previousActiveElement?.focus();
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className={`relative w-full ${maxWidthClasses[maxWidth]} bg-white rounded-lg shadow-lg focus:outline-none ${maxHeight ?? ''} max-h-[90vh] flex flex-col`}
      >
        {/* Header */}
        {title && (
          <div className="sticky top-0 z-10 flex justify-between items-center border-b px-6 py-4 bg-white rounded-t-lg">
            <div>
              <h2 className={titleClassName ?? 'text-lg font-semibold'}>{title}</h2>
              <h4 className="text-[#64748B]">{description}</h4>
            </div>
            {showCloseIcon && (
              <button
                aria-label="Close"
                className="p-2 rounded-full cursor-pointer text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                onClick={onClose}
              >
                <XIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Scrollable Content */}
        <div
          className={`overflow-y-auto modal-scroll px-6 py-4 ${overflowAuto ? 'flex-grow' : ''}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
