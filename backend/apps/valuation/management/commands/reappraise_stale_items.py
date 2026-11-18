from django.core.management.base import BaseCommand

from apps.valuation.tasks import reappraise_stale_items


class Command(BaseCommand):
    help = "Re-appraise stale collection items whose valued_at exceeds VALUATION_STALE_DAYS."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=None, help="Staleness threshold in days")
        parser.add_argument("--batch-size", type=int, default=25, help="Max items to process per run")

    def handle(self, *args, **options):
        result = reappraise_stale_items(
            stale_days=options["days"],
            batch_size=options["batch_size"],
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Checked={result['checked']} Reappraised={result['reappraised']} "
                f"SkippedLocked={result['skipped_locked']} Failed={result['failed']}"
            )
        )
