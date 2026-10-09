# Synkro

Synkro is a real-time collaborative workspace where teams create shared rooms and write notes together. It helps students avoid scattered copies, delayed updates, and uncertainty about who is working in a room.

## What it does

- Lets users sign in and create or join a room.
- Keeps a shared room note synchronized through Socket.IO.
- Shows which room members are online.
- Saves notes and their revision history in MongoDB Atlas.
- Lets room owners restore an earlier version.

The core editor uses server-ordered last-write-wins updates. Concurrent edits are saved as revisions so earlier accepted content can be recovered. Planned stretch features include CRDT-based merging, comments on selected text, and editor/viewer roles.

## Technology

Synkro uses JavaScript across a React frontend and Node.js backend. Socket.IO handles live collaboration, and MongoDB Atlas stores users, rooms, notes, and revision history. The frontend is hosted on Vercel, with the persistent backend on Render.

Synkro is being developed for TechSpace BuildLab '26 problem statement A04, Real-Time Collaborative Workspace.
