from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.catalog.reference_sync import (
    run_daily_reference_sync,
    run_hourly_market_sync,
    run_weekly_static_sync,
    seed_static_reference_catalog,
)


class Command(BaseCommand):
    help = "Seed and synchronize static reference tables (Collector Guru) across tiered cadences."

    def add_arguments(self, parser):
        parser.add_argument(
            "--tier",
            type=str,
            choices=["seed", "weekly", "daily", "hourly"],
            default="seed",
            help="Sync cadence to execute (seed, weekly, daily, hourly).",
        )
        parser.add_argument(
            "--offline",
            action="store_true",
            default=False,
            help="Execute sync strictly against local files without outbound HTTP calls.",
        )

    def handle(self, *args, **options):
        tier = options["tier"].lower()
        offline = options["offline"]

        self.stdout.write(f"Executing static reference sync: tier={tier}, offline={offline}")

        if tier == "seed":
            counts = seed_static_reference_catalog()
            self.stdout.write(self.style.SUCCESS(f"Successfully seeded fixtures: {counts}"))
        elif tier == "weekly":
            res = run_weekly_static_sync(offline=offline)
            self.stdout.write(self.style.SUCCESS(f"Weekly sync complete: {res}"))
        elif tier == "daily":
            res = run_daily_reference_sync(offline=offline)
            self.stdout.write(self.style.SUCCESS(f"Daily baselines sync complete: {res}"))
        elif tier == "hourly":
            res = run_hourly_market_sync()
            self.stdout.write(self.style.SUCCESS(f"Hourly benchmark complete: {res}"))
