# Milestone 3 keyboard walkthrough receipt

- Date: 2026-10-10T23:20:32.612Z
- Page: http://localhost:3213
- Viewport: 1440x900, Chromium headless
- Dragged card: "Build contact us page"

## Step 0 — initial board
```json
{
  "Todo": [
    "Implement user authentication",
    "Build contact us page",
    "Create product catalog",
    "Develop about us page",
    "Optimize website for mobile devices",
    "Integrate payment gateway",
    "Perform testing and bug fixing",
    "Launch website and deploy to server"
  ],
  "In progress": [
    "Develop homepage layout",
    "Design color scheme and typography"
  ],
  "Done": [
    "Project initiation and planning",
    "Gather requirements from stakeholders",
    "Create wireframes and mockups"
  ]
}
```

## Step 1 — press Space (pick up)
- Announced: "Task was moved over position 2 of 8 in column Todo"

## Step 2 — press ArrowDown (move within Todo)
- Announced: "Task was moved over position 3 of 8 in column Todo"
- Board after: ["Implement user authentication","Create product catalog","Build contact us page","Develop about us page","Optimize website for mobile devices","Integrate payment gateway","Perform testing and bug fixing","Launch website and deploy to server"]

## Step 3 — press ArrowRight (move over the In progress column)
- Announced: "Task Build contact us page was moved over column In progress in position 2 of 3"
- Board after: {"Todo":["Implement user authentication","Create product catalog","Develop about us page","Optimize website for mobile devices","Integrate payment gateway","Perform testing and bug fixing","Launch website and deploy to server"],"In progress":["Develop homepage layout","Build contact us page","Design color scheme and typography"],"Done":["Project initiation and planning","Gather requirements from stakeholders","Create wireframes and mockups"]}

## Step 4 — press Space (drop: commit the move)
- Announced: "Task was dropped into column In progress in position 2 of 3"
- Board after: {"Todo":["Implement user authentication","Create product catalog","Develop about us page","Optimize website for mobile devices","Integrate payment gateway","Perform testing and bug fixing","Launch website and deploy to server"],"In progress":["Develop homepage layout","Build contact us page","Design color scheme and typography"],"Done":["Project initiation and planning","Gather requirements from stakeholders","Create wireframes and mockups"]}
- Check: committed state differs from pre-drag state ✓

## Step 5 — press Space, ArrowRight (over Done), Escape (cancel)
- Board mid-drag (working copy): {"Todo":["Implement user authentication","Develop about us page","Optimize website for mobile devices","Integrate payment gateway","Perform testing and bug fixing","Launch website and deploy to server"],"In progress":["Create product catalog","Develop homepage layout","Build contact us page","Design color scheme and typography"],"Done":["Project initiation and planning","Gather requirements from stakeholders","Create wireframes and mockups"]}
- Check: drag produced intermediate movement to discard ✓
- Announced: "Dragging Task cancelled."
- Board after cancel: {"Todo":["Implement user authentication","Create product catalog","Develop about us page","Optimize website for mobile devices","Integrate payment gateway","Perform testing and bug fixing","Launch website and deploy to server"],"In progress":["Develop homepage layout","Build contact us page","Design color scheme and typography"],"Done":["Project initiation and planning","Gather requirements from stakeholders","Create wireframes and mockups"]}
- Check: board restored to the exact pre-drag state ✓

## Result

PASS — keyboard pickup, within-column move, cross-column move, drop-commit, and cancel-restore all behaved as recorded above. The cancelled drag restored the exact pre-drag board state and was announced as "Dragging Task cancelled.".
