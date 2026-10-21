## Canvas and graph UI rules
- Use `@xyflow/react` for pan, zoom, nodes and edges. Never write custom pan, zoom or hit-testing.
- Custom nodes and edges are memoized. Pan and zoom must not re-render nodes. Keep viewport out of component state that nodes subscribe to.
- Separate stored data (node positions, viewport) from derived data (states, edge states, progress). Never persist derived data.
- Every canvas feature has a non-canvas equivalent (the right panel list) for keyboard and screen-reader users.
- Verify with screenshots at zoom 25%, 100% and 200%, and with 5, 50 and 200 nodes. Report frame behavior when panning 200 nodes.
- Do not add dependencies other than `@xyflow/react` and `@dagrejs/dagre`. Confirm their current versions and licenses first.
- Do not build editing (connect, create, delete) until a task asks for it.