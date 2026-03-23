# Listening Refinement Report

## Validation

- Test command: `npm run test:unit -- src/lib/listening-drill-bank.test.ts src/app/api/drill/next/route.test.ts src/app/api/ai/generate_drill/route.test.ts`
- Result: `3` test files passed, `23` tests passed
- Curated midpoint validation: `0` invalid items
- Representative selection check: every sampled Elo returned a `curated` item with the correct `bandPosition`

## Sub-band Counts And Samples

### A1 entry
- Counts: `curated 102 / draft 80 / total 182`
- `Please open the classroom door now.`
- `My lunch is in the fridge.`
- `We start math at nine.`

### A1 mid
- Counts: `curated 103 / draft 79 / total 182`
- `Please leave your bag beside the desk.`
- `The bus stop is behind school.`
- `We have art class after lunch.`

### A1 exit
- Counts: `curated 103 / draft 79 / total 182`
- `Please put the clean cups on this shelf.`
- `Our English test starts right after break.`
- `The cashier needs your card at checkout.`

### A2- entry
- Counts: `curated 116 / draft 80 / total 196`
- `Please leave the keys on my front desk.`
- `The bus stops here after the traffic light.`
- `I saved you a seat near the window.`

### A2- mid
- Counts: `curated 105 / draft 93 / total 198`
- `Please charge the speaker for the study group tonight.`
- `The bakery line is shorter near the side entrance.`
- `I left your notebook in the second desk drawer.`

### A2- exit
- Counts: `curated 105 / draft 93 / total 198`
- `Please keep your phone silent during the morning training session.`
- `The front office needs your passport copy for the booking.`
- `I left the spare charger inside the kitchen cabinet yesterday.`

### A2+ entry
- Counts: `curated 140 / draft 64 / total 204`
- `Call me when you get off the train.`
- `If the printer jams again, ask Ben for help.`
- `Text me when the shuttle reaches the hotel.`

### A2+ mid
- Counts: `curated 105 / draft 99 / total 204`
- `I stayed inside because the wind was getting stronger outside.`
- `If the nurse calls again, tell her I am downstairs.`
- `We can start the meeting when Maya brings the notes.`

### A2+ exit
- Counts: `curated 105 / draft 99 / total 204`
- `I left early because the subway delay was getting worse by the minute.`
- `If the hotel cannot hold our bags, we should head straight to brunch.`
- `When the projector finally worked, the speaker skipped the first two slides.`

### B1 entry
- Counts: `curated 100 / draft 124 / total 224`
- `We left the concert early because the parking lot was already filling up.`
- `After the meeting slipped, I carried the marked copy upstairs to check it again.`
- `Please keep the spare key at the front desk until checkout today.`

### B1 mid
- Counts: `curated 100 / draft 124 / total 224`
- `I turned off the stove when I realized the soup was already boiling.`
- `When the tour was wrapping up, the guide asked us to leave the headsets by the exit table.`
- `We moved the lesson to room four right after lunch was over.`

### B1 exit
- Counts: `curated 100 / draft 124 / total 224`
- `The package was delivered to the office that closes before lunch on Fridays.`
- `If reception still hasn't checked the storage slip, we'll keep the bags by the wall chairs for now.`
- `I called the driver as soon as the bus left the stop to check the next ride.`

### B2 entry
- Counts: `curated 100 / draft 122 / total 222`
- `Although we'd booked early, the airline moved our seats and split the family across three rows.`
- `Although the routing sheet looked fine, the address error at the loading bay had already slowed the whole batch.`
- `By the time the manager called, we'd already moved the equipment into the storage room.`

### B2 mid
- Counts: `curated 100 / draft 122 / total 222`
- `If the supplier misses another deadline, we're going to lose the contract before the review board meets again.`
- `If support hadn't escalated the case first, we wouldn't have noticed the refund dispute was already affecting next week's follow-up.`
- `Although the room looked ready, the projector kept cutting out during the chart review.`

### B2 exit
- Counts: `curated 100 / draft 122 / total 222`
- `Even after the entrance settled down, the coordinator kept the spare run sheet in place in case the opening set slipped again.`
- `If the client asks for another revision, we'll need to rewrite the summary before morning.`
- `If the client changes the scope again, we'll need to adjust the plan before Friday.`

### C1 entry
- Counts: `curated 100 / draft 121 / total 221`
- `If they'd flagged the discrepancy sooner, we could've fixed the report before the board started questioning every projection.`
- `By the time the admin admitted the sync cycle couldn't handle that traffic spike, the easiest recovery window had already gone.`
- `By the time we noticed the discrepancy, the report had already quietly shaped the board's reaction.`

### C1 mid
- Counts: `curated 100 / draft 121 / total 221`
- `What really stalled the claim review wasn't the delay in paperwork, but how lightly the earlier note had framed the key evidence.`
- `What made the delay awkward was not the delay itself, but the way it kept pulling attention away from the real issue.`
- `The more we reviewed it, the more obvious it became that the earlier note had quietly changed the whole reading.`

### C1 exit
- Counts: `curated 100 / draft 120 / total 220`
- `Rarely do teams recover so quickly once trust has broken down and every update is being read as damage control.`
- `Not until the mentor compared the two module drafts side by side did everyone admit the version gap had skewed the whole training review.`
- `Not until the second review did everyone admit the earlier notes had framed the problem too neatly to be useful.`

### C2 entry
- Counts: `curated 167 / draft 0 / total 167`
- `Even after the board approved the proposal in principle, several department heads kept stalling, arguing that the timeline was unrealistic and the long-term costs had been underestimated.`
- `Had the warnings been taken seriously when the first audit came back, the rollout wouldn't have collapsed under pressure from three competing departments.`
- `Not until the route supervisor laid the incident log beside the dispatch revision did everyone admit the evening peak had gone wrong because the judgment itself had drifted.`

### C2 mid
- Counts: `curated 167 / draft 0 / total 167`
- `When the programme chair laid the older marking rubric beside the revised module, it became obvious the teaching dispute came from the design itself, not from inconsistent delivery.`
- `Although the client kept pressing on the call about why the handover had slipped, what really prolonged the mess was how lightly the earlier summary had framed the risk.`
- `By the time the risk officer admitted the holding notice was only buying time, the transfer trail that actually needed explaining had been blurred by three rounds of verbal reassurance.`

### C2 exit
- Counts: `curated 166 / draft 0 / total 166`
- `Even after the first review flagged the sampling bias, the research lead kept the team writing along the same storyline, so the whole panel ended up circling a premise that wouldn't hold.`
- `Had the show caller not brought in the standby crew ten minutes before the opening set, the cues already drifting backstage would have made the whole start feel patched together.`
- `Not until the plant supervisor matched the earliest inspection batch against the restart plan did anyone admit the so-called isolated fluctuation had been driving rework up all along.`

### C2+ entry
- Counts: `curated 167 / draft 0 / total 167`
- `Not until the regional directors compared the raw figures side by side did anyone admit the efficiency gains came from shifting delays downstream, where local teams were left improvising fixes without budget.`
- `Only after the interim findings leaked and investors started asking who had approved the assumptions did executives concede the model had been overstating demand, understating risk, and ignoring the weakest regional data.`
- `Had the holding statement been used to explain the facts rather than merely dampen the coverage, the press secretary wouldn't have been patching an unsustainable line by the third round of questions.`

### C2+ mid
- Counts: `curated 167 / draft 0 / total 167`
- `What finally made compliance counsel stop defending the disclosure wasn't the wording alone, but how every step backward made it clearer the whole inquiry had been built around a deliberately narrowed problem.`
- `By the time the policy adviser admitted the uptake gap came from indicators that never captured the field reality, the impact note had already distorted two rounds of resource allocation.`
- `Even though the shift engineer saw the load imbalance widening from the start, what turned the repair window into a chain failure was the backup feed everyone cited as proof of stability.`

### C2+ exit
- Counts: `curated 166 / draft 0 / total 166`
- `Had the claim summary not reduced the dispute to a paperwork gap, the assessment unit might have seen earlier that what was being quietly shifted was liability itself, not the evidence.`
- `Not until the programme manager laid the donor note beside the extension request did everyone admit the reporting gap belonged to a funding narrative built to avoid the hardest facts.`
- `When the infra lead set the recovery brief against the earliest sync-failure logs, it became clear the real collapse was not the restart itself, but the judgment everyone had been normalizing.`

## Manual QA Conclusion

- Satisfied: `A1`, `A2- entry/mid`, `A2+ entry`, `B1`, `B2`, `C1`, `C2`, `C2+`
- Acceptable but worth a second pass if you want tighter product polish: `A2- exit`, `A2+ mid`, `A2+ exit`
- Main reason for the second-pass candidates: sentence quality is valid and natural enough, but those buckets still have the highest chance of sounding slightly more “training-oriented” than the stronger B1+ buckets

## Second-Pass Update

- Completed a second refinement pass on `A2- exit`, `A2+ mid`, and `A2+ exit`
- Rewrote the repetitive high-priority refinement patterns in code rather than adding more volume
- Re-verified with the same unit test command; result stayed `23/23 passed`
- Representative second-pass front-row samples:
  - `Please leave the marker by the desk before you head out.`
  - `I waited by the desk because the teacher still had the marker.`
  - `Text me when the marker gets to the desk after class.`
- Updated conclusion: these three buckets are now good enough to stay in the main curated pool without a blocking third pass
