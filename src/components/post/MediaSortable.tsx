"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Film, ImageIcon, GripVertical, Star } from "lucide-react";

// Generic item interface that works for both new files and existing media
export interface SortableMediaItem {
  id: string;
  type: "image" | "video";
  preview: string; // URL for preview (blob URL for new files, or storage URL for existing)
  isProcessing?: boolean;
}

interface SortableItemProps {
  item: SortableMediaItem;
  index: number;
  isOverlay?: boolean;
  disabled?: boolean;
}

function SortableItem({ item, index, isOverlay = false, disabled = false }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: item.id,
    disabled: disabled || item.isProcessing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isCover = index === 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden bg-muted group touch-none",
        isDragging && "opacity-50 z-50",
        isOverlay && "shadow-2xl ring-2 ring-saffron scale-105",
        isCover && !isDragging && "ring-2 ring-saffron ring-offset-2",
        item.isProcessing && "opacity-60"
      )}
    >
      {/* Media preview */}
      {item.type === "video" ? (
        <div className="relative w-full h-full bg-navy/10 flex items-center justify-center">
          <Film className="h-12 w-12 text-navy/40" />
          <video
            src={item.preview}
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.preview}
          alt={`Media ${index + 1}`}
          className="w-full h-full object-cover"
          draggable={false}
        />
      )}

      {/* Drag handle - visible on touch and hover */}
      {!item.isProcessing && !disabled && (
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "p-3 rounded-full bg-black/60 text-white",
            "transition-opacity cursor-grab active:cursor-grabbing",
            "opacity-60 sm:opacity-0 sm:group-hover:opacity-100",
            "touch-none select-none"
          )}
          type="button"
          aria-label="Træk for at omsortere"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}

      {/* Cover badge */}
      {isCover && !isDragging && (
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-saffron text-white text-xs font-medium flex items-center gap-1 shadow-md">
          <Star className="h-3 w-3 fill-current" />
          Cover
        </div>
      )}

      {/* Type indicator */}
      <div className="absolute bottom-2 left-2 p-1 rounded bg-black/50">
        {item.type === "video" ? (
          <Film className="h-3 w-3 text-white" />
        ) : (
          <ImageIcon className="h-3 w-3 text-white" />
        )}
      </div>

      {/* Position number */}
      <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs font-medium flex items-center justify-center">
        {index + 1}
      </div>
    </div>
  );
}

// Overlay component for dragging preview
function DragOverlayItem({ item, index }: { item: SortableMediaItem; index: number }) {
  return (
    <div
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden bg-muted",
        "shadow-2xl ring-2 ring-saffron scale-105"
      )}
      style={{ width: 150, height: 150 }}
    >
      {item.type === "video" ? (
        <div className="relative w-full h-full bg-navy/10 flex items-center justify-center">
          <Film className="h-8 w-8 text-navy/40" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.preview}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      )}
      
      {/* Position number */}
      <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-saffron text-white text-xs font-medium flex items-center justify-center">
        {index + 1}
      </div>
    </div>
  );
}

interface MediaSortableProps {
  items: SortableMediaItem[];
  onReorder: (items: SortableMediaItem[]) => void;
  disabled?: boolean;
  renderExtraOverlay?: (item: SortableMediaItem, index: number) => React.ReactNode;
}

export function MediaSortable({ 
  items, 
  onReorder, 
  disabled = false,
  renderExtraOverlay,
}: MediaSortableProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Configure sensors for both mouse/touch
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Need to move 8px before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // Hold for 200ms before drag starts (prevents accidental drags)
        tolerance: 5, // Allow 5px movement during delay
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      
      const newItems = arrayMove(items, oldIndex, newIndex);
      onReorder(newItems);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  // Find the active item and its original index for the overlay
  const activeItem = activeId ? items.find((item) => item.id === activeId) : null;
  const activeIndex = activeId ? items.findIndex((item) => item.id === activeId) : -1;

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Instructions */}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <GripVertical className="h-3 w-3" />
        Hold og træk for at ændre rækkefølgen. Første billede bliver cover.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map((item, index) => (
              <div key={item.id} className="relative">
                <SortableItem 
                  item={item} 
                  index={index}
                  disabled={disabled}
                />
                {renderExtraOverlay?.(item, index)}
              </div>
            ))}
          </div>
        </SortableContext>

        {/* Drag overlay - shows what's being dragged */}
        <DragOverlay adjustScale>
          {activeItem && activeIndex >= 0 ? (
            <DragOverlayItem item={activeItem} index={activeIndex} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
