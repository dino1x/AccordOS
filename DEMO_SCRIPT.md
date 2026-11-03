# AccordOS Demo Script (2:50)

Record at 1440 x 900 in Live Sandbox mode with the telemetry drawer visible. Before recording, press **Reset demo** and have a PayPal Sandbox personal account signed in for the approval popups. Each beat lists what to say, what to do on screen, and what to say instead if something fails.

| Time | Say | Do | If it fails |
| --- | --- | --- | --- |
| 0:00 to 0:12 | "A contractor running a $64,000 fit-out lives in four systems: invoices, suppliers, a schedule and payouts. When money moves late, the plan breaks and nobody notices. AccordOS puts PayPal at the centre of the plan." | Status strip visible, Stage 01 open, strip reads Live on PayPal Sandbox. | Same line. Replay mode is labelled honestly. |
| 0:12 to 0:35 | "Claude reads the brief. A dynamic-programming allocator splits the budget exactly, fourteen thousand states in about a millisecond. Each milestone becomes a real PayPal invoice with an early-payment rule and a scannable QR." | Click **Plan from brief**. Point at the allocation bar. On the Handover card, click **Issue invoice** and the QR appears. | "This invoice was sent from the PayPal Invoicing API a moment ago." Show the existing QR. |
| 0:35 to 0:50 | "The client pays through PayPal's JS SDK v6, and the deposit is booked on the invoice." | On Hardware installed, click **Pay with PayPal** and approve in the popup. The card turns Captured. | Click **Record payment**. |
| 0:50 to 1:20 | "Now procurement. Channel3 finds real SKUs, and three vendor agents compete live in a reverse auction. One undercuts, one matches, one sells speed. The winner is not paid: it gets a PayPal Orders v2 authorization, and only if the policy vault passes it." | Stage 02. Let one auction animate. Point at the five vault rules. Click **Approve hold** on the hold still awaiting approval and approve in the PayPal popup. The tag turns Held. Use a real approval on camera: fast-forwarded holds are tagged as simulated. | Click **Skip** to show the final round. If the popup fails, use **Fast-forward approvals** and say the hold is simulated. |
| 1:20 to 1:50 | "Payments are dependencies. This task cannot start until the invoice is paid. When a PayPal webhook lands, the operations agent reflows the plan. A carrier delay pushes everything downstream, and it tells you exactly what moved." | Stage 03. Click **Webhook: invoice paid**: bars slide left and gates turn green. Click **Carrier delay +3d**: bars slide right in both the Gantt and the Bryntum Scheduler. Point at the agent log. | Point at the existing log entries. |
| 1:50 to 2:15 | "Every dollar has a chain of custody, from client to escrow to vendor, with the PayPal call that moved it. Ask a finance question and get a live widget." | Stage 04. Scroll the AG Grid. Click the margin suggestion chip and drag the cost slider to the cliff. Show the AG Studio dashboard, then type "Add a column chart of ledger volume by PayPal API" into its AI Assistant and let Claude build it. Click **Run firewall-gated payouts**. | Use the seeded Nudge Scoreboard. |
| 2:15 to 2:40 | "Don't trust me, attack it. Prompt injection, bank redirection, a lookalike payee, split payments. Eight attacks blocked in under a millisecond each, zero PayPal calls, and the clean control still passes. If a buyer disputes, the defense agent files tracked evidence." | Stage 05. Click **Run all 9 attacks**. Show the matrix. Click **Open dispute**, then **Build and submit dossier**. | Fire attacks one by one. |
| 2:40 to 2:50 | "Every PayPal call goes through MCP, using PayPal's own Agent Toolkit schemas. The AI proposes, deterministic code and a human dispose, and PayPal moves every cent." | Open the telemetry drawer: each MCP tools/call frame sits above the APIMatic SDK or REST call it caused. | Same line. |

## Judge tour

The **Judge tour** button in the header runs the same story by itself in about 30 seconds, one beat per stage:
1. It settles a tranche.
2. It authorizes and captures a hold.
3. It triggers a carrier delay.
4. It runs payouts.
5. It fires the red-team bench, then opens the telemetry drawer.

Record it once as a fallback cut, or point judges to it on the Devpost page.

## 60-second cut

0:00 problem (one line). 0:08 Stage 01, plan and issue an invoice with its QR. 0:20 Stage 02, the auction and the approve-hold popup. 0:35 Stage 03, the webhook reflow. 0:45 Stage 05, run all attacks. 0:55 close line.

## Recording checklist

- [ ] `npm run build && npm start` with Sandbox keys. The status strip reads Live on PayPal Sandbox.
- [ ] Sandbox buyer account logged in for the JS SDK v6 popups.
- [ ] Reset demo pressed just before recording.
- [ ] Browser zoom 100%, OS notifications off.
- [ ] Video under 3:00, uploaded public on YouTube, link in the Devpost form.
