# Tasks: Clean Geometric Subject Extraction & GrabCut Safety Guard

- [x] Collect real-world raw sample photos (slabs, loose coins, Goldbacks, proof sets, 2x2 flips)
- [x] Update `detect_card_rectangle`, `detect_circular_coin`, & `process_item_image` in `backend/apps/catalog/image_processing.py` for geometric-first extraction
- [x] Add GrabCut contiguity & fill-ratio safety guard (`_remove_background_grabcut_guarded`) in `backend/apps/catalog/image_processing.py`
- [x] Verify clean extraction across real-world sample types (assay cards, proof sets, Goldbacks, 2x2 flips, loose coins)
- [x] Add regression test in `backend/tests/test_catalog.py` and run full backend test suite
- [x] Commit, PR, merge, and deploy updated backend image to K3s
