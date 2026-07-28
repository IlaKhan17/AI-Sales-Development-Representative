'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Reusable add/remove string chip input. Controlled: pass value + onChange.
 */
export function ListInput({
  value,
  onChange,
  placeholder = 'Add item…',
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const item = draft.trim();
    if (!item) return;
    if (!value.includes(item)) onChange([...value, item]);
    setDraft('');
  };

  const remove = (item: string) => {
    onChange(value.filter((v) => v !== item));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={add}
          disabled={disabled || !draft.trim()}
          aria-label="Add item"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((item) => (
            <Badge key={item} variant="secondary" className="gap-1 pr-1">
              <span className="max-w-[240px] truncate">{item}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(item)}
                  className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  aria-label={`Remove ${item}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
