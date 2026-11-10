import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Lista arrastável (mouse, toque e teclado: espaço + setas). Devolve os ids na nova ordem. */
export function SortableList({ ids, onReorder, horizontal, children }: { ids: string[]; onReorder: (ids: string[], from: number, to: number) => void; horizontal?: boolean; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id)), to = ids.indexOf(String(over.id));
    onReorder(arrayMove(ids, from, to), from, to);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ container: document.body }}>
      <SortableContext items={ids} strategy={horizontal ? horizontalListSortingStrategy : verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

type Render = (p: { ref: (el: HTMLElement | null) => void; style: CSSProperties; handle: HTMLAttributes<HTMLElement>; dragging: boolean }) => ReactNode;
export function Sortable({ id, children }: { id: string; children: Render }) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id });
  return <>{children({
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 10 : undefined, position: 'relative' },
    handle: { ...attributes, ...listeners },
    dragging: isDragging,
  })}</>;
}

export const Handle = ({ className, ...p }: HTMLAttributes<HTMLElement>) => (
  <span aria-label="Arrastar para reordenar" className={cn('cursor-grab touch-none rounded p-1 text-gf-muted hover:text-gf-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gf-orange active:cursor-grabbing', className)} {...p}>
    <GripVertical className="h-5 w-5" />
  </span>
);
