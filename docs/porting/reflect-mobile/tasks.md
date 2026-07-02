# Porting the Tasks tab

**v2 status: post-release.** Tasks are explicitly out of mobile v1
(Plan 19); the desktop Tasks surface (Plan 18) has shipped, so the mobile
wave is "put a touch surface over the existing task getters" — plus the
three genuinely mobile-native interactions V1 added, recorded here.

## What V1 mobile does

Implementation: `client/screens/tasks/` (screen, `task-group-list.tsx`,
`task-item.tsx`, `edit-modal.tsx`, `filters-modal.tsx`), over the shared
V1 task model (`client/models/task/` — tasks are nodes inside note
documents, collected into a derived list).

### The list

- A third tab. Tasks grouped **Overdue / Today / Upcoming / Done**
  (mirroring desktop V1's groupings), each group with a title and count,
  collapsible.
- A task row: square checkbox, title, and a small gray label linking to
  the source note. Checking strikes through and mutes the row, with a
  light haptic. Completed tasks can be archived out of view.
- The FAB is hidden while in the Tasks tab (`mobileView.isTasksView`).

### The mobile-native interactions

1. **Drag-and-drop scheduling**: dnd-kit with a PointerSensor and an
   8 pt activation distance (so taps never start drags). Dragging a task
   over a group highlights it with a haptic; dropping reschedules the
   task into that group (scheduling is a backlink to a daily note inside
   the task content, same as desktop V1).
2. **Quick-edit modal**: tapping a task opens an inline edit modal —
   title, scheduling, completion — **without opening the source note**.
   Edits write through to the task node in the note document.
3. **Scheduling picker**: a date picker in the edit modal for explicit
   due dates.

A filters modal narrows the list (status/date/tags).

### Not on mobile

No recurring tasks, no subtasks/nesting, no keyboard scheduling flows —
those were desktop-only or nonexistent in V1.

## What changes in v2, and why

- **The data model is already decided and shipped on desktop** (Plan 18):
  tasks are markdown checkboxes (`- [ ]`) collected by the index, with
  V1-exact buckets (Overdue = explicit `[[date]]` only), `setTaskDueDate`
  scheduling, and toggle/convert actions. Mobile adds no model — it is a
  screen over `packages/core` task getters, exactly like the All tab is a
  screen over search getters.
- **Reuse desktop's grouping and semantics verbatim** (V1-parity there
  was already litigated on desktop). The mobile-specific work is
  interaction: touch checkboxes with haptics, the quick-edit modal, and
  drag-between-groups as the touch equivalent of desktop's scheduling
  calendar.
- **Drag activation distance matters.** V1's 8 pt PointerSensor threshold
  is the difference between "drag to schedule" and "every tap flickers a
  drag" — port the constraint, whatever the DnD implementation.
- Editing a task from the list writes through the same note-session write
  path as any edit (no second write path), which also keeps the
  in-process file-change seam and sync dirty-marking working for free.

## V1 → v2 mapping

| V1                                          | v2                                                            |
| ------------------------------------------- | -------------------------------------------------------------- |
| Task nodes in ProseMirror docs              | `- [ ]` markdown lines, indexed (desktop Plan 18, shipped)     |
| Overdue / Today / Upcoming / Done groups    | Desktop v2 buckets, reused verbatim                            |
| Drag between groups = reschedule            | Touch scheduling over `setTaskDueDate`                         |
| Quick-edit modal (edit without opening)     | Port: bottom sheet over the task's note session                |
| Square checkbox + haptic + strikethrough    | Port as-is                                                     |
| Filters modal                               | Follow desktop's filter set                                    |
| FAB hidden in Tasks                         | n/a (no FAB in v2)                                             |
