import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { HomeworkAssignment, HomeworkTask } from "../services/aiAssist";

/**
 * Homework board store.
 * Assignments are persisted to localStorage so the study board survives
 * reloads. Each assignment holds an AI-generated task breakdown.
 */

const HOMEWORK_STORAGE_KEY = "essira-homework-v1";

export interface HomeworkStore {
  assignments: HomeworkAssignment[];
  addAssignment(assignment: HomeworkAssignment): void;
  removeAssignment(assignmentId: string): void;
  toggleTask(assignmentId: string, taskId: string): void;
  addTask(assignmentId: string, title: string, detail: string, estimateMinutes: number): void;
  removeTask(assignmentId: string, taskId: string): void;
  updateAssignment(assignmentId: string, patch: Partial<Pick<HomeworkAssignment, "title" | "subject" | "dueDate">>): void;
}

export const useHomeworkStore = create<HomeworkStore>()(
  persist(
    (set) => ({
      assignments: [],

      addAssignment(assignment) {
        set((state) => ({ assignments: [...state.assignments, assignment] }));
      },

      removeAssignment(assignmentId) {
        set((state) => ({
          assignments: state.assignments.filter((assignment) => assignment.id !== assignmentId),
        }));
      },

      toggleTask(assignmentId, taskId) {
        set((state) => ({
          assignments: state.assignments.map((assignment) =>
            assignment.id === assignmentId
              ? {
                  ...assignment,
                  tasks: assignment.tasks.map((task) =>
                    task.id === taskId ? { ...task, done: !task.done } : task,
                  ),
                }
              : assignment,
          ),
        }));
      },

      addTask(assignmentId, title, detail, estimateMinutes) {
        const task: HomeworkTask = {
          id: crypto.randomUUID(),
          title,
          detail,
          estimateMinutes: Math.max(5, Math.round(estimateMinutes)),
          done: false,
        };
        set((state) => ({
          assignments: state.assignments.map((assignment) =>
            assignment.id === assignmentId
              ? { ...assignment, tasks: [...assignment.tasks, task] }
              : assignment,
          ),
        }));
      },

      removeTask(assignmentId, taskId) {
        set((state) => ({
          assignments: state.assignments.map((assignment) =>
            assignment.id === assignmentId
              ? { ...assignment, tasks: assignment.tasks.filter((task) => task.id !== taskId) }
              : assignment,
          ),
        }));
      },

      updateAssignment(assignmentId, patch) {
        set((state) => ({
          assignments: state.assignments.map((assignment) =>
            assignment.id === assignmentId ? { ...assignment, ...patch } : assignment,
          ),
        }));
      },
    }),
    {
      name: HOMEWORK_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
