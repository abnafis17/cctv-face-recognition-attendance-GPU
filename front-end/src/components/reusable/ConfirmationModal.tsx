import React from 'react';
import { Button } from '@/components/ui/button';
import ReusableModal from './ReusableModal';
import { Trash, X } from 'lucide-react';

interface ConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'submit';
}

const ConfirmationModal = ({
  variant = 'destructive',
  open,
  onClose,
  onConfirm,
  loading,
  title = 'Are you sure you want to proceed?',
  description = 'This action will permanently remove the task from the system. You won’t be able to recover it later.',
}: ConfirmationModalProps) => {
  return (
    <ReusableModal open={open} onClose={onClose}>
      <div className="">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-600 mt-2">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            variant="outline"
            className="hover:text-blue-600 flex items-center gap-2"
            onClick={onClose}
          >
            <X />
            Cancel
          </Button>
          <Button
            variant={variant}
            className={`${variant === 'destructive' ? `bg-destructive/70` : 'bg-blue-500'}   flex items-center gap-2`}
            onClick={onConfirm}
            disabled={loading}
          >
            <Trash />
            {loading ? 'Processing...' : 'Yes, confirm'}
          </Button>
        </div>
      </div>
    </ReusableModal>
  );
};
export default ConfirmationModal;
