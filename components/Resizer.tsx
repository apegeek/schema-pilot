import React, { useRef } from 'react';
import { GripVertical, GripHorizontal } from 'lucide-react';

interface ResizerProps {
  orientation: 'vertical' | 'horizontal';
  className?: string;
  title?: string;
  style?: React.CSSProperties;
  onDragStart?: () => void;
  onDrag: (delta: number) => void;
  onDragEnd?: () => void;
  showIcon?: boolean;
  iconClassName?: string;
}

const Resizer: React.FC<ResizerProps> = ({ orientation, className, title, style, onDragStart, onDrag, onDragEnd, showIcon = true, iconClassName = "w-3 h-3 text-gray-500 pointer-events-none" }) => {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const moveHandler = (e: PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    const delta = orientation === 'vertical' ? dx : dy;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => onDrag(delta));
  };
  const upHandler = () => {
    startRef.current = null;
    document.body.classList.remove('no-select');
    document.body.style.cursor = 'auto';
    window.removeEventListener('pointermove', moveHandler);
    window.removeEventListener('pointerup', upHandler);
    if (onDragEnd) onDragEnd();
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = { x: e.clientX, y: e.clientY };
    document.body.classList.add('no-select');
    document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', upHandler);
    if (onDragStart) onDragStart();
  };
  return (
    <div
      className={`flex items-center justify-center ${className || ''}`}
      style={style}
      title={title}
      onPointerDown={onDown}
      onDragStart={(e) => { e.preventDefault(); return false; }}
    >
      {showIcon && (orientation === 'vertical' ? <GripVertical className={iconClassName} /> : <GripHorizontal className={iconClassName} />)}
    </div>
  );
};

export default Resizer;
