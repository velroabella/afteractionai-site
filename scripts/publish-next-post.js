#!/usr/bin/env node
/**
 * publish-next-post.js
 *
 * Pulls the next post from blog-queue.json, generates an SVG thumbnail,
 * stamps it with today's publish_date, appends it to blog-posts.json,
 * and removes it from the queue.
 *
 * Exit codes:
 *   0 = post published successfully
 *   1 = error
 *   2 = queue empty (not an error — just nothing to publish)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'data', 'blog-queue.json');
const POSTS_PATH = path.join(ROOT, 'data', 'blog-posts.json');
const THUMB_DIR = path.join(ROOT, 'images', 'blog');

// ── Read JSON safely ─────────────────────────────────────
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('Failed to read ' + filePath + ':', err.message);
    process.exit(1);
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ── Generate SVG thumbnail ───────────────────────────────
function generateThumbnail(post) {
  var label = post.thumbnail_label || post.category || 'Blog';
  var accent = post.thumbnail_accent || '#DC3545';
  // Truncate label for SVG display
  if (label.length > 14) label = label.substring(0, 13) + '…';

  var svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">',
    '  <defs>',
    '    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
    '      <stop offset="0%" style="stop-color:#1a1a2e"/>',
    '      <stop offset="100%" style="stop-color:#16213e"/>',
    '    </linearGradient>',
    '  </defs>',
    '  <rect width="600" height="400" fill="url(#bg)"/>',
    '  <circle cx="300" cy="155" r="50" fill="none" stroke="' + accent + '" stroke-width="3.5" opacity="0.8"/>',
    '  <text x="300" y="168" text-anchor="middle" fill="' + accent + '" font-family="Inter,sans-serif" font-size="20" font-weight="700">' + escapeXml(label) + '</text>',
    '  <text x="300" y="250" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-family="Inter,sans-serif" font-size="16" font-weight="600">' + escapeXml(post.category || '') + '</text>',
    '  <text x="300" y="280" text-anchor="middle" fill="rgba(255,255,255,0.45)" font-family="Inter,sans-serif" font-size="13">AfterAction AI</text>',
    '</svg>'
  ].join('\n');

  var filename = post.id + '.svg';
  var filePath = path.join(THUMB_DIR, filename);
  fs.writeFileSync(filePath, svg, 'utf8');
  return 'images/blog/' + filename;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Main ─────────────────────────────────────────────────
function main() {
  var queue = readJSON(QUEUE_PATH);
  var posts = readJSON(POSTS_PATH);

  if (!Array.isArray(queue) || queue.length === 0) {
    console.log('Blog queue is empty. No post to publish.');
    process.exit(2);
  }

  // Take the first post from the queue
  var next = queue.shift();

  // Check for duplicate
  var isDuplicate = posts.some(function(p) { return p.id === next.id; });
  if (isDuplicate) {
    console.log('Post "' + next.id + '" already published. Removing from queue and retrying...');
    writeJSON(QUEUE_PATH, queue);
    // Try the next one recursively (up to 5 attempts)
    if (queue.length > 0) {
      main();
      return;
    }
    console.log('All remaining queue items were duplicates. Queue is now empty.');
    process.exit(2);
  }

  // Generate thumbnail
  if (!fs.existsSync(THUMB_DIR)) {
    fs.mkdirSync(THUMB_DIR, { recursive: true });
  }
  var thumbPath = generateThumbnail(next);

  // Build the published post object
  var now = new Date();
  var publishedPost = {
    id: next.id,
    title: next.title,
    excerpt: next.excerpt,
    publish_date: now.toISOString(),
    category: next.category,
    author: next.author || 'AfterAction AI Team',
    thumbnail: thumbPath,
    url: null
  };

  // Append to published posts
  posts.push(publishedPost);
  writeJSON(POSTS_PATH, posts);

  // Save updated queue
  writeJSON(QUEUE_PATH, queue);

  console.log('Published: "' + next.title + '"');
  console.log('Thumbnail: ' + thumbPath);
  console.log('Queue remaining: ' + queue.length + ' posts');
  console.log('Total published: ' + posts.length + ' posts');
}

main();
