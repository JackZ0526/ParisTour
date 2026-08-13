# Icon policy

- Use an individually imported component from `lucide-react` for every generic UI icon.
- Do not add handwritten inline SVG icons to React components.
- Provider trademarks (Google, Tripadvisor, Booking.com, OpenAI, DeepSeek) are brand marks, not generic icons. Keep approved assets in `public/brand` and render them as images.
- Numbered map markers are data visualization labels. Their marker container may remain generated SVG, while semantic map glyphs such as hotel and airport must come from Lucide.

Run `npm run lint:icons` to verify the policy. The regular `npm run lint` command runs this check automatically.
