import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapState } from "@/hooks/useMapState";

describe("useMapState", () => {
  describe("initial state", () => {
    it("defaults to satellite style", () => {
      const { result } = renderHook(() => useMapState());
      expect(result.current.mapStyle).toBe("satellite");
    });

    it("respects initialStyle option", () => {
      const { result } = renderHook(() =>
        useMapState({ initialStyle: "streets" })
      );
      expect(result.current.mapStyle).toBe("streets");
    });

    it("starts with no error", () => {
      const { result } = renderHook(() => useMapState());
      expect(result.current.hasError).toBe(false);
    });

    it("starts with mapKey 0", () => {
      const { result } = renderHook(() => useMapState());
      expect(result.current.mapKey).toBe(0);
    });
  });

  describe("toggleStyle", () => {
    it("toggles from satellite to streets", () => {
      const { result } = renderHook(() => useMapState());

      act(() => {
        result.current.toggleStyle();
      });

      expect(result.current.mapStyle).toBe("streets");
    });

    it("toggles from streets to satellite", () => {
      const { result } = renderHook(() =>
        useMapState({ initialStyle: "streets" })
      );

      act(() => {
        result.current.toggleStyle();
      });

      expect(result.current.mapStyle).toBe("satellite");
    });

    it("toggles back and forth", () => {
      const { result } = renderHook(() => useMapState());

      act(() => {
        result.current.toggleStyle();
      });
      expect(result.current.mapStyle).toBe("streets");

      act(() => {
        result.current.toggleStyle();
      });
      expect(result.current.mapStyle).toBe("satellite");
    });
  });

  describe("error handling", () => {
    it("setError sets hasError to true", () => {
      const { result } = renderHook(() => useMapState());

      act(() => {
        result.current.setError();
      });

      expect(result.current.hasError).toBe(true);
    });

    it("clearError sets hasError to false", () => {
      const { result } = renderHook(() => useMapState());

      act(() => {
        result.current.setError();
      });
      expect(result.current.hasError).toBe(true);

      act(() => {
        result.current.clearError();
      });
      expect(result.current.hasError).toBe(false);
    });

    it("retry clears error and increments mapKey", () => {
      const { result } = renderHook(() => useMapState());

      act(() => {
        result.current.setError();
      });
      expect(result.current.hasError).toBe(true);
      expect(result.current.mapKey).toBe(0);

      act(() => {
        result.current.retry();
      });
      expect(result.current.hasError).toBe(false);
      expect(result.current.mapKey).toBe(1);
    });
  });

  describe("auto-clear error on focus change", () => {
    it("clears error when focusLat/focusLng change", () => {
      const { result, rerender } = renderHook(
        (props) => useMapState(props),
        { initialProps: { focusLat: undefined, focusLng: undefined } }
      );

      // Set error
      act(() => {
        result.current.setError();
      });
      expect(result.current.hasError).toBe(true);

      // Change focus coordinates
      rerender({ focusLat: 10.5, focusLng: 76.5 });
      expect(result.current.hasError).toBe(false);
    });
  });
});
