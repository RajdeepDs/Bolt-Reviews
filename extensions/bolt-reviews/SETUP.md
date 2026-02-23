# Bolt Reviews Theme Extension Setup

## Overview

This theme extension provides three blocks that can be added to your Shopify theme:
1. **Rating Summary** - Shows aggregate ratings and star distribution
2. **Reviews List** - Displays customer reviews with photos and helpful buttons
3. **Write Review Form** - Allows customers to submit reviews

## Installation

The theme extension is automatically installed when you install the Bolt Reviews app on your store.

## Configuration

### 1. Set App URL (IMPORTANT for Production)

The theme extension needs to know your app's URL to fetch and submit reviews. There are two ways to configure this:

#### Option A: Using Shop Metafields (Recommended)

Set a shop metafield with your app URL:

**Namespace:** `bolt_reviews`  
**Key:** `app_url`  
**Value:** Your production app URL (e.g., `https://your-app-name.onrender.com`)

You can set this via:
- Shopify Admin API
- A setup endpoint in your app
- Manually in Shopify Admin (Settings → Custom data → Shops)

#### Option B: Default URL

Update the default URL in each block file by replacing:
```liquid
{{ shop.metafields.bolt_reviews.app_url.value | default: 'https://your-app.onrender.com' }}
```

Change `https://your-app.onrender.com` to your actual production URL.

#### Option C: Global JavaScript Variable

Add this script to your theme's `theme.liquid` file (before `</head>`):
```html
<script>
  window.BOLT_REVIEWS_APP_URL = 'https://your-app-name.onrender.com';
</script>
```

### 2. Add Blocks to Product Pages

1. Go to **Online Store → Themes**
2. Click **Customize** on your active theme
3. Navigate to a product page
4. Click **Add section** or **Add block**
5. Under "Apps" find **Bolt Reviews**
6. Add the blocks you want:
   - **Rating Summary** - Usually near product title/price
   - **Reviews List** - In product description area
   - **Write Review Form** - Below reviews list or in a tab

### 3. Configure Block Settings

Each block has customizable settings:

#### Rating Summary
- Show rating distribution chart
- Show total review count
- Filter by star rating

#### Reviews List
- Reviews per page (1-20)
- Show review photos
- Show verified purchase badge
- Show helpful buttons

#### Write Review Form
- Require photo upload
- Show email field

## Testing

After installation:

1. Visit a product page on your storefront
2. Check browser console for any errors
3. Verify the blocks are loading (you'll see loading spinners)
4. If products have no reviews, you should see "No reviews yet" message
5. Test submitting a review using the form

## Troubleshooting

### Reviews Not Loading

**Check browser console for errors:**
```
Failed to fetch reviews
```

**Solutions:**
- Verify app URL is set correctly
- Check app is deployed and running
- Verify product exists in app database
- Check CORS is enabled on public API endpoints

### "Unable to load reviews"

This means the API request failed. Check:
- App URL configuration (see Configuration section)
- Network tab in browser DevTools
- App server logs for errors

### Reviews Submit But Don't Appear

Reviews may be pending moderation:
- Check app admin → Reviews
- Review status might be "pending"
- Change settings to auto-publish reviews

### Wrong Product Reviews Showing

Make sure `product.id` is correctly passed. The blocks use:
```liquid
data-product-id="{{ product.id }}"
```

This should automatically work on product pages.

## API Endpoints Used

The theme extension makes calls to these public API endpoints:

- `GET /api/public/reviews?productId={id}` - Fetch reviews
- `GET /api/public/reviews/summary?productId={id}` - Fetch rating summary
- `POST /api/public/reviews/create` - Submit new review
- `POST /api/public/reviews/{id}/helpful` - Mark review as helpful

## Customization

### Styling

All blocks include embedded CSS. To customize:

1. Identify the block file in `extensions/bolt-reviews/blocks/`
2. Modify the `<style>` section
3. Save and the changes will apply automatically

### Translations

To add translations, modify the text in the Liquid files directly or use Shopify's theme localization features.

## Production Checklist

Before going live:

- [ ] App URL configured correctly (not localhost or cloudflare tunnel)
- [ ] Blocks added to product page template
- [ ] Test review submission works
- [ ] Test review display works
- [ ] Test on mobile devices
- [ ] Verify CORS headers allow your storefront domain
- [ ] Check app logs for errors
- [ ] Test helpful buttons work
- [ ] Verify photos display correctly

## Support

If you encounter issues:

1. Check browser console for errors
2. Check app server logs
3. Verify app URL configuration
4. Ensure products are synced to app database
5. Test API endpoints directly using curl/Postman

## Development Notes

For local development with Shopify CLI:
- The cloudflare tunnel URL changes each time
- You'll need to update the metafield or default URL
- Or use global JavaScript variable approach
- Test on a development store before production