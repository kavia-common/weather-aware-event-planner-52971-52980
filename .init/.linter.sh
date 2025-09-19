#!/bin/bash
cd /home/kavia/workspace/code-generation/weather-aware-event-planner-52971-52980/event_planner_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

