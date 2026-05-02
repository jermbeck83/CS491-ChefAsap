Refresh Views Blueprint:
materialized views cache data, and need to know when there is an update necessary, therefore:
This refreshes these views quickly
Can use a render “cron job” to automate it:
Automating it on Render
   You don't want to run this manually.


Go to your Render Dashboard.


Click New + and select Cron Job.


Connect it to your existing GitHub repository.


Build Command: pip install -r requirements.txt


Start Command: python database/refresh_views.py


Schedule: 0 * * * * (This cron syntax runs it at the top of every hour. If you only need daily updates, use 0 0 * * * for midnight).

IF NOT

locally run in venv environment in backend folder: 'python -m database.refresh_views'