/**
 * Reusable card component: styled container with glassmorphism effect and padding options.
 */
import { type HTMLAttributes, forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Extra padding variant. Defaults to 'md'. */
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-7',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding = 'md', className = '', children, style, ...props }, ref) => (
    <div
      ref={ref}
      className={[
        'rounded-[var(--radius-card)]',
        'bg-white/70',
        'border border-white/60',
        paddingMap[padding],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      {...props}
    >
      {children}
    </div>
  ),
);

Card.displayName = 'Card';
