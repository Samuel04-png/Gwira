# Dashboard Workflow Specification

## 0. Product intent

The Dashboard is a workflow supervision experience first. It visualizes actual company work and verified relationships; it is not a general-purpose workflow builder. Data transformations remain separate from graphical presentation, and a connection is never inferred from timestamps or proximity.

## 1. Data principles

- Production renders local application records only.
- Development fixtures are isolated from production and never presented as company activity.
- Human employees display reported work, not invented live status.
- Doat execution state comes from recorded task/run facts.
- Records without verified relationships remain unlinked.

## 2. Dashboard structure

The Dashboard keeps the existing left navigation and sidebar. Its main area has top tabs, a central visual workflow canvas, a persistent desktop right panel, and a compact Ask Gwira interface at the bottom. Top tabs are **Workflow**, **Timeline**, **List**, **Calendar**, and **Board**; Workflow is the default.

## 3. Visual workflow canvas

The central canvas provides nodes for actual company work and connections for verified relationships. It supports pan, zoom, selection, and inspection with compact controls. Node types are Objective, Task, Doat execution, Human work, Approval, and Result.

## 4. Relationships

All relationships are explicit and have stable identifiers: Contains, Depends on, Assigned to, Produced, and Gates. Assignment connections are distinct from execution and dependency connections. An assignee change or timestamp sequence never implies a handoff or dependency.

## 5. Right panel

The persistent desktop right panel remains visible with nothing selected. Default mode shows Team and Activity. Selected mode shows a selected employee, Doat, task, workflow, approval, or connection with goal/current work, execution steps, connections, activity, and supported communication actions.

## 6. Ask Gwira

Ask Gwira may only pass context the application can explicitly supply. It must not imply it can message a worker, query records, or execute a business instruction until that operation has a real implementation.

## 7. Interaction safety

Viewing or selecting never mutates business records. Workflow editing, reassignment, and dependency creation require explicit authorization. Stop, pause, and approval controls use existing execution and permission checks.

## 8. Unavailable data

Unavailable features are disabled with a specific explanation. An empty production workspace shows canvas structure and an empty state; it never generates example nodes.

## 9. Accessibility and verification

Canvas capabilities require keyboard equivalents, meaningful node names, visible focus, and non-colour status cues. Verify in Electron at 1280×800, 1440×900, and the minimum supported size, including 25%, 100%, and 200% zoom, long titles, disconnected/branching records, multiple states, and Home/sidebar baseline comparison.
