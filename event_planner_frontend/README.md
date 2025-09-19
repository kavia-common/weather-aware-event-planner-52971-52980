# Weather-Aware Event Planner Frontend

React app providing:
- Calendar UI with weather overlay
- Event planning and booking form
- Weather-based recommendations
- Live integration with backend endpoints:
  - GET /api/weather/
  - GET/POST /api/events/
  - GET /api/recommendation/
  - GET /api/locations/

## Quickstart

1) Install dependencies
   npm install

2) Configure backend URL (optional)
   Copy .env.example to .env and set:
   REACT_APP_BACKEND_URL=http://localhost:3001

   If omitted, the app will call same-origin.

3) Start the app
   npm start
   Open http://localhost:3000

## Notes

- The app expects the backend to expose the above endpoints (OpenAPI provided in backend container).
- Location selector drives the weather and recommendation panels.
- The calendar overlays a simple weather badge for "today" and shows event dots per day.
- The UI follows the "Ocean Professional" theme with responsive layout (two-column on desktop, stacked on mobile).

## Accessibility

- Keyboard focus outlines and ARIA labels provided for key controls.

## Testing

   npm test
