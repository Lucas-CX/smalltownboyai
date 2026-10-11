import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export function DanceDialog({
  open,
  onOpenChange,
  title,
  description,
  className,
  showCloseButton = true,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  className: string;
  showCloseButton?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`dance-flow-dialog ${className}`}
        showCloseButton={false}
      >
        <div className="dance-flow-heading">
          <DialogTitle>{title}</DialogTitle>
          {showCloseButton && (
            <DialogClose
              render={<Button variant="ghost" size="icon" aria-label="Close" />}
            >
              <X />
            </DialogClose>
          )}
        </div>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
