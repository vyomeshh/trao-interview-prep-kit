import { create } from "zustand";

const useKitStore = create((set) => ({
  kit: null,
  setKit: (kit) => set({ kit }),
  clearKit: () => set({ kit: null })
}));

export default useKitStore;
