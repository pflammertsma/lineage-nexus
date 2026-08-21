import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Reusable Button component matching the Lineage Nexus Design System.
 * Ensures strict, unified height, padding, font size, and icon positioning.
 */
export function Button({
  children,
  icon: Icon,
  loading = false,
  disabled = false,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className = '',
  onClick,
  ...props
}) {
  const variantClasses = {
    secondary: 'admin-btn-secondary',
    action: 'admin-btn-action',
    primary: 'admin-btn-action',
    danger: 'admin-btn-danger',
  };

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-[11px]',
    md: 'px-3 py-1.5 text-xs',
    lg: 'px-4 py-2 text-sm',
  };

  const baseClass = variantClasses[variant] || variantClasses.secondary;
  const sizeClass = sizeClasses[size] || sizeClasses.md;

  const IconComponent = loading ? Loader2 : Icon;
  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 16 : 13;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClass} ${sizeClass} ${className}`.trim()}
      {...props}
    >
      {IconComponent && (
        <IconComponent
          size={iconSize}
          className={`shrink-0 ${loading ? 'animate-spin' : ''}`}
        />
      )}
      {children}
    </button>
  );
}

export default Button;
