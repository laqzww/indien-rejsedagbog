"use client";

import { useState, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxTags?: number;
}

const SUGGESTED_TAGS = [
  "mad",
  "natur",
  "tempel",
  "strand",
  "transport",
  "hotel",
  "marked",
  "solnedgang",
  "dyreliv",
  "kultur",
];

export function TagInput({
  value,
  onChange,
  placeholder = "Tilføj tag...",
  disabled = false,
  maxTags = 10,
}: TagInputProps) {
  const [input, setInput] = useState("");

  const addTag = (tag: string) => {
    const normalizedTag = tag.toLowerCase().trim();
    if (
      normalizedTag &&
      !value.includes(normalizedTag) &&
      value.length < maxTags
    ) {
      onChange([...value, normalizedTag]);
    }
    setInput("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const unusedSuggestions = SUGGESTED_TAGS.filter(
    (tag) => !value.includes(tag)
  );

  return (
    <div className="space-y-3">
      {/* Tags display */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <Badge
              key={tag}
              variant="default"
              className="gap-1 pr-1 cursor-default"
            >
              #{tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={disabled}
                className="ml-1 hover:bg-white/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input */}
      {value.length < maxTags && (
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/[^a-zA-ZæøåÆØÅ0-9]/g, ""))}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full"
        />
      )}

      {/* Suggestions */}
      {unusedSuggestions.length > 0 && value.length < maxTags && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Forslag:</span>
          {unusedSuggestions.slice(0, 5).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              disabled={disabled}
              className="text-xs px-2 py-0.5 rounded-full border border-border hover:border-saffron hover:text-saffron transition-colors"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

