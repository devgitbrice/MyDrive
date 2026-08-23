import { create } from "zustand";

export type NewItemStatus =
  | "idle"
  | "observation"
  | "title"
  | "uploading"
  | "success"
  | "error";

type NewItemState = {
  // Data
  photo: File | null;
  photos: File[]; // Batch (multi-file) upload queue
  observation: string;
  title: string;

  // Flow
  status: NewItemStatus;
  error: string | null;

  // Actions data
  setPhoto: (file: File | null) => void;
  setPhotos: (files: File[]) => void;
  setObservation: (value: string) => void;
  setTitle: (value: string) => void;

  // Actions flow
  setStatus: (status: NewItemStatus) => void;
  setError: (message: string | null) => void;

  resetAll: () => void;
};

export const useNewItemStore = create<NewItemState>((set) => ({
  photo: null,
  photos: [],
  observation: "",
  title: "",
  status: "idle",
  error: null,

  setPhoto: (file) =>
    set({
      photo: file,
      photos: [],
      status: file ? "observation" : "idle",
    }),

  setPhotos: (files) =>
    set({
      photos: files,
      photo: null,
      status: files.length > 0 ? "title" : "idle",
    }),

  setObservation: (value) => set({ observation: value }),
  setTitle: (value) => set({ title: value }),

  setStatus: (status) => set({ status }),

  setError: (message) =>
    set({
      error: message,
      status: "error",
    }),

  resetAll: () =>
    set({
      photo: null,
      photos: [],
      observation: "",
      title: "",
      status: "idle",
      error: null,
    }),
}));
