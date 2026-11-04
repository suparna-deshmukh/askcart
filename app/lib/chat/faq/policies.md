# AskCart assistant FAQ passages
# Each passage: `## id`, a keyword line (aliases, | separated) and the reply
# text. Replies are <= 40 words, start with "Demo:" wherever the statement is
# not a real marketplace policy. Retrieval is substring/alias scoring - no LLM.

## delivery
delivery|shipping|arrive|arrival|how long|when will|dispatch
Demo: There is no real shipping in this demo. The delivery estimate you see is illustrative and labelled "demo" - it is not a promise or a live carrier quote.

## returns
return|returns|refund|exchange|reship
Demo: Returns and refunds are simulated. In the demo you can remove items from the cart, but no money moves and no return is actually processed.

## payment
payment|payments|pay|upi|card|cod|netbanking|wallet
Demo: Payment is simulated. No real payment method is charged; the checkout exists to show the flow, and "Buy now" only updates the local cart.

## tracking
track|tracking|order status|order update|where is my order
Demo: Orders are not real, so there is no tracking to show. A placed order only appears as a confirmation toast in the demo.

## demo
demo|real|fake|genuine product|is this real|live marketplace|fake data
Demo: AskCart runs on an India-oriented demo catalogue (about 36,000 SKUs: US-sourced listings converted to INR plus an India layer). Prices and ratings are indicative, not live marketplace data.

## privacy
privacy|data|my details|pincode|where is my data|analytics
Demo: No PII is stored. Your pincode is kept in your own browser and reduced to a coarse region before it touches anything. Search and click events power the public analytics dashboard.

## ranking
rank|ranking|how do you rank|how results are ordered|relevance|why this order
Demo: Results are ranked by a deterministic lexical scorer: title and brand matches, budget fit, occasion tags, recipient and spec signals, with a small rating tiebreak. No LLM chooses products.

## why_questions
why do you ask|why questions|follow-up question|questions why|asking why
Demo: Each question maps to a root cause mined from 6,041 real search complaints - budget mismatch and trust gaps dominate. One question per turn, at most three per search, and every answer visibly changes the results.

## price
price inclusive|tax|taxes|inclusive of all taxes|mrp
Demo: Prices shown are "inclusive of all taxes" in the demo sense - a single display number from the demo catalogue, with no live price feed or tax breakdown.

## warranty
warranty|guarantee|service center|repair
Demo: Warranty terms are not part of the demo catalogue, so I can't confirm them. The product listing only carries title, price, rating, brand and category fields.

## checkout
checkout|place order|how to order|order how
Demo: Checkout is a simulated flow: cart, fake payment step, confirmation toast. Nothing is billed and no order exists outside your browser session.

## catalogue
catalogue|catalog|where do products come from|us converted|source data
Demo: The catalogue is built from public datasets (AMAZON-Products-2023 and India-layer sources), converted to INR and deduplicated. It is a demo - not a live marketplace.

## similar
similar|alternatives|more like this|other options like
Demo: "Similar" items come from the same category within about 40% of the price, ordered by rating. All from the demo catalogue.

## gift_wrapping
gift wrap|wrapping|gift message|packaging
Demo: Gift wrapping is not modelled. In this build you can attach a one-line gift message to a prototype order when the query was gift-tagged.

## rating
rating|ratings|review|reviews|star|how is rating
Demo: Ratings are indicative. The India layer's ratings were synthetically jittered at build time; the PDP shows a Bayesian-adjusted rating so low-count items don't outrank well-reviewed ones.

## language
language|hindi|hinglish|language switch
Demo: The assistant answers in English, Hinglish or Hindi from static phrase tables - no LLM translation - and follows the language you write in.

## out_of_scope_policy
health|medical|legal|finance|homework|coding help
Demo: I only answer from the shopping catalogue. Health, legal and financial questions are out of scope - please use appropriate professional services.
