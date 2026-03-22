> ⚠️ DISCLAIMER:
> - THIS IS HOBBY PROJECT AND HAS NOTHING RELATED TO S2O EVENT ORGANIZER
> - **DO NOT** JUDGE ANY CODE, IT'S MY SCRAP PAPER, FOR ENTERTAINMENT PURPOSE

# S2O Price Tracker
This project contain 2 apps `fetcher` and `viewer`


# Original Prompt 😅
this project will have 2 app
1. fetcher, 2. viewer

let start with fetcher app

basically, create a typescript that will deploy to lambda aws and it trigger
by schedule

this script will basically scrape this website
https://resale.eventpop.me/e/s2o-2026/

and extract following information

- ticket_level (regular, vip)
- ticket_type (All 3 days, day 1, day2, day3)
- offer price
- offer volume

use these information to insert into supabase db
with
- created at (fetch date time (with timezone)

table s2o_historical_price
