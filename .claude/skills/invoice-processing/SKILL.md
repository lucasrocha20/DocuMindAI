# Invoice Processing Skill

When working on invoice processing:

1. Validate all LLM responses with Zod.
2. Never trust extracted invoice values without validation.
3. Use database transactions when saving invoices and items.
4. Handle duplicate processing safely.
5. Keep Cerebras integration isolated from business logic.
6. Add tests for successful and failed extraction.
7. Never log API keys or sensitive invoice contents.
8. Keep the implementation simple and avoid unnecessary abstractions.