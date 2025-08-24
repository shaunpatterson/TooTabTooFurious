#!/usr/bin/env python3
"""
Dataset Generator for Tab Categorization
Generates comprehensive training data for fine-tuning local models
"""

import json
import random
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
import pandas as pd
from datetime import datetime
import hashlib

class TabCategorizationDatasetGenerator:
    """Generate training data for tab categorization"""
    
    def __init__(self):
        self.categories = {
            'Dev': {
                'keywords': ['github', 'stackoverflow', 'npm', 'docker', 'kubernetes', 'api', 
                            'documentation', 'tutorial', 'programming', 'coding', 'developer',
                            'framework', 'library', 'debug', 'git', 'ide', 'terminal', 'code'],
                'domains': ['github.com', 'stackoverflow.com', 'npmjs.com', 'docker.com', 
                           'kubernetes.io', 'gitlab.com', 'bitbucket.org', 'jetbrains.com',
                           'visualstudio.com', 'codepen.io', 'replit.com', 'codesandbox.io',
                           'dev.to', 'hackernoon.com', 'medium.com/tag/programming'],
                'title_patterns': [
                    '{language} Tutorial - {topic}',
                    'How to {action} in {language}',
                    '{framework} Documentation',
                    'Stack Overflow - {error_type} error in {language}',
                    'GitHub - {user}/{repo}: {description}',
                    '{tool} Installation Guide',
                    'Debug {issue} in {framework}'
                ]
            },
            'Social': {
                'keywords': ['social', 'network', 'friend', 'follow', 'share', 'post', 'tweet',
                            'message', 'chat', 'profile', 'feed', 'timeline', 'story', 'reel'],
                'domains': ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com',
                           'reddit.com', 'discord.com', 'slack.com', 'telegram.org', 
                           'whatsapp.com', 'snapchat.com', 'tiktok.com', 'pinterest.com'],
                'title_patterns': [
                    '{username} on Twitter: "{tweet_preview}"',
                    'Facebook - {page_name}',
                    'LinkedIn: {professional_title}',
                    'Instagram • {photo_description}',
                    'Reddit - {subreddit}: {post_title}',
                    'Discord | {server_name}',
                    '{platform} Messages'
                ]
            },
            'Entertainment': {
                'keywords': ['watch', 'video', 'movie', 'series', 'music', 'game', 'play',
                            'stream', 'episode', 'song', 'album', 'artist', 'trailer', 'live'],
                'domains': ['youtube.com', 'netflix.com', 'spotify.com', 'twitch.tv',
                           'hulu.com', 'disney.com', 'primevideo.com', 'hbomax.com',
                           'soundcloud.com', 'pandora.com', 'steam.com', 'epicgames.com'],
                'title_patterns': [
                    'YouTube - {video_title}',
                    'Netflix - Watch {show_name}',
                    'Spotify – {song} by {artist}',
                    'Twitch - {streamer} Live',
                    '{game_name} on Steam',
                    'Watch {movie} Online',
                    '{artist} - {album} Full Album'
                ]
            },
            'Work': {
                'keywords': ['email', 'calendar', 'meeting', 'document', 'spreadsheet', 'presentation',
                            'project', 'task', 'deadline', 'report', 'invoice', 'productivity'],
                'domains': ['gmail.com', 'outlook.com', 'office.com', 'docs.google.com',
                           'sheets.google.com', 'slides.google.com', 'notion.so', 'monday.com',
                           'asana.com', 'trello.com', 'jira.atlassian.com', 'confluence.atlassian.com'],
                'title_patterns': [
                    'Gmail - Inbox ({count} unread)',
                    'Google Docs - {document_name}',
                    'Microsoft Teams | {team_name}',
                    'Zoom Meeting - {meeting_title}',
                    'Notion – {workspace_name}',
                    'Jira - {project_key}: {issue_title}',
                    'Calendar - {event_name}'
                ]
            },
            'Cloud': {
                'keywords': ['aws', 'azure', 'gcp', 'cloud', 'server', 'database', 'storage',
                            'compute', 'lambda', 'container', 'devops', 'infrastructure', 'deploy'],
                'domains': ['aws.amazon.com', 'console.aws.amazon.com', 'azure.microsoft.com',
                           'cloud.google.com', 'digitalocean.com', 'heroku.com', 'vercel.com',
                           'netlify.com', 'cloudflare.com', 'firebase.google.com'],
                'title_patterns': [
                    'AWS Console - {service_name}',
                    'Azure Portal | {resource_group}',
                    'Google Cloud Console - {project_name}',
                    'Heroku Dashboard - {app_name}',
                    'Vercel – {deployment_status}',
                    'CloudFlare - {domain}',
                    'Firebase Console - {project}'
                ]
            },
            'Shopping': {
                'keywords': ['buy', 'shop', 'cart', 'checkout', 'product', 'price', 'deal',
                            'discount', 'sale', 'order', 'shipping', 'payment', 'store'],
                'domains': ['amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'bestbuy.com',
                           'etsy.com', 'aliexpress.com', 'shopify.com', 'nike.com', 'apple.com/shop'],
                'title_patterns': [
                    'Amazon.com: {product_name}',
                    'eBay - {item} for sale',
                    '{store} - {product} - ${price}',
                    'Shopping Cart - {store_name}',
                    '{brand} Official Store - {category}',
                    'Checkout - {items} items',
                    '{product} Review and Price'
                ]
            },
            'News': {
                'keywords': ['news', 'article', 'breaking', 'report', 'update', 'latest',
                            'headline', 'story', 'journalism', 'press', 'media', 'editorial'],
                'domains': ['nytimes.com', 'bbc.com', 'cnn.com', 'reuters.com', 'bloomberg.com',
                           'wsj.com', 'theguardian.com', 'washingtonpost.com', 'npr.org', 'apnews.com'],
                'title_patterns': [
                    '{news_outlet} - {headline}',
                    'Breaking: {event_description}',
                    '{topic} News - Latest Updates',
                    'Opinion | {article_title}',
                    '{location} News: {story_title}',
                    'Live Updates: {ongoing_event}',
                    '{category} - {news_site}'
                ]
            }
        }
        
        # Template variables for pattern filling
        self.template_vars = {
            'language': ['Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'Go', 'Rust', 'Ruby'],
            'framework': ['React', 'Vue', 'Angular', 'Django', 'Flask', 'Express', 'Spring', 'Rails'],
            'tool': ['Docker', 'Git', 'npm', 'yarn', 'webpack', 'VSCode', 'vim', 'tmux'],
            'username': ['john_doe', 'tech_guru', 'dev_master', 'code_ninja', 'alice_smith'],
            'platform': ['Facebook', 'Twitter', 'Instagram', 'LinkedIn', 'Discord'],
            'video_title': ['Tutorial Part 1', 'Best Moments 2024', 'Official Trailer', 'Full Documentary'],
            'game_name': ['Cyberpunk 2077', 'Minecraft', 'Fortnite', 'League of Legends', 'Valorant'],
            'product_name': ['Laptop Stand', 'Wireless Mouse', 'USB-C Hub', 'Monitor', 'Keyboard'],
            'news_outlet': ['CNN', 'BBC', 'Reuters', 'Bloomberg', 'The Guardian'],
            'service_name': ['EC2', 'S3', 'Lambda', 'RDS', 'CloudFront', 'DynamoDB'],
            'store_name': ['Amazon', 'Best Buy', 'Target', 'Walmart', 'Home Depot']
        }
    
    def generate_url(self, domain: str, path_parts: List[str] = None) -> str:
        """Generate realistic URL"""
        url = f"https://{domain}"
        if path_parts:
            url += "/" + "/".join(path_parts)
        return url
    
    def generate_title(self, pattern: str) -> str:
        """Generate title from pattern"""
        title = pattern
        # Replace template variables
        for var in self.template_vars:
            placeholder = f'{{{var}}}'
            if placeholder in title:
                title = title.replace(placeholder, random.choice(self.template_vars[var]))
        
        # Handle remaining placeholders with generic values
        remaining_vars = {
            'topic': 'Advanced Concepts',
            'action': 'implement authentication',
            'user': 'developer',
            'repo': 'awesome-project',
            'description': 'A useful tool',
            'error_type': 'TypeError',
            'issue': 'memory leak',
            'tweet_preview': 'Just shipped a new feature!',
            'page_name': 'Tech Community',
            'professional_title': 'Senior Developer',
            'photo_description': 'Beautiful sunset',
            'subreddit': 'r/programming',
            'post_title': 'Need help with this code',
            'server_name': 'Dev Community',
            'show_name': 'The Tech Show',
            'song': 'Digital Dreams',
            'artist': 'Code Band',
            'streamer': 'TechStreamer',
            'movie': 'The Matrix',
            'album': 'Greatest Hits',
            'count': str(random.randint(1, 99)),
            'document_name': 'Q4 Report',
            'team_name': 'Engineering',
            'meeting_title': 'Sprint Planning',
            'workspace_name': 'My Workspace',
            'project_key': 'PROJ-123',
            'issue_title': 'Fix navigation bug',
            'event_name': 'Team Standup',
            'resource_group': 'production-rg',
            'project_name': 'my-project',
            'app_name': 'my-app',
            'deployment_status': 'Deployment Complete',
            'domain': 'example.com',
            'project': 'MyApp',
            'item': 'Vintage Watch',
            'store': 'TechStore',
            'product': 'Gaming Mouse',
            'price': str(random.randint(10, 999)),
            'brand': 'TechBrand',
            'category': 'Electronics',
            'items': str(random.randint(1, 10)),
            'headline': 'Major Development in Tech Industry',
            'event_description': 'Tech Company Announces New Product',
            'article_title': 'The Future of Technology',
            'location': 'Silicon Valley',
            'story_title': 'Innovation Continues to Grow',
            'ongoing_event': 'Tech Conference 2024',
            'category': 'Technology',
            'news_site': 'TechNews'
        }
        
        for var, value in remaining_vars.items():
            placeholder = f'{{{var}}}'
            if placeholder in title:
                title = title.replace(placeholder, value)
        
        return title
    
    def generate_sample(self, category: str) -> Dict:
        """Generate a single training sample"""
        cat_data = self.categories[category]
        
        # Choose domain
        domain = random.choice(cat_data['domains'])
        
        # Generate URL with path
        path_parts = []
        if random.random() > 0.3:  # 70% chance of having path
            path_parts = [
                random.choice(['page', 'view', 'dashboard', 'content', 'item']),
                str(random.randint(1000, 9999))
            ]
        url = self.generate_url(domain, path_parts)
        
        # Generate title
        if cat_data['title_patterns'] and random.random() > 0.2:
            title = self.generate_title(random.choice(cat_data['title_patterns']))
        else:
            # Fallback to keyword-based title
            keywords = random.sample(cat_data['keywords'], min(3, len(cat_data['keywords'])))
            title = f"{domain.split('.')[0].title()} - {' '.join(keywords).title()}"
        
        # Add some noise/variation
        if random.random() > 0.8:  # 20% chance of extra text
            title += f" | {random.choice(['Updated', '2024', 'New', 'Latest', 'Pro'])}"
        
        return {
            'url': url,
            'title': title,
            'category': category,
            'domain': domain,
            'timestamp': datetime.now().isoformat()
        }
    
    def generate_dataset(self, num_samples: int, split_ratio: float = 0.8) -> Tuple[List[Dict], List[Dict]]:
        """Generate full dataset with train/val split"""
        samples = []
        
        # Generate balanced samples
        samples_per_category = num_samples // len(self.categories)
        
        for category in self.categories:
            for _ in range(samples_per_category):
                samples.append(self.generate_sample(category))
        
        # Add remaining samples randomly
        remaining = num_samples - len(samples)
        for _ in range(remaining):
            category = random.choice(list(self.categories.keys()))
            samples.append(self.generate_sample(category))
        
        # Shuffle
        random.shuffle(samples)
        
        # Split into train/val
        split_idx = int(len(samples) * split_ratio)
        train_samples = samples[:split_idx]
        val_samples = samples[split_idx:]
        
        return train_samples, val_samples
    
    def format_for_finetuning(self, samples: List[Dict]) -> List[Dict]:
        """Format samples for fine-tuning"""
        formatted = []
        
        for sample in samples:
            # Create instruction-response format for fine-tuning
            instruction = f"Categorize this browser tab into one of these categories: {', '.join(self.categories.keys())}. URL: {sample['url']} Title: {sample['title']}"
            response = sample['category']
            
            formatted.append({
                'instruction': instruction,
                'input': '',  # Can be empty for this task
                'output': response,
                'url': sample['url'],
                'title': sample['title']
            })
        
        return formatted
    
    def add_hard_examples(self, samples: List[Dict]) -> List[Dict]:
        """Add challenging edge cases"""
        hard_examples = [
            # Ambiguous cases
            {'url': 'https://medium.com/@developer/machine-learning-tutorial', 
             'title': 'Introduction to Machine Learning with Python', 
             'category': 'Dev'},  # Could be Education
            {'url': 'https://youtube.com/watch?v=coding-tutorial', 
             'title': 'Learn Python in 10 Minutes - Tutorial', 
             'category': 'Dev'},  # YouTube but educational
            {'url': 'https://amazon.com/books/programming', 
             'title': 'Best Programming Books 2024', 
             'category': 'Shopping'},  # Shopping for dev resources
            {'url': 'https://linkedin.com/learning/web-development', 
             'title': 'LinkedIn Learning - Full Stack Development', 
             'category': 'Dev'},  # Social platform but dev content
            {'url': 'https://reddit.com/r/cloudcomputing', 
             'title': 'Reddit - Cloud Computing Discussion', 
             'category': 'Cloud'},  # Social platform but cloud topic
            {'url': 'https://docs.google.com/document/sprint-planning', 
             'title': 'Sprint Planning Document - Q4 2024', 
             'category': 'Work'},  # Dev-related but work doc
        ]
        
        return samples + hard_examples
    
    def save_datasets(self, train_samples: List[Dict], val_samples: List[Dict], output_dir: str = 'data'):
        """Save datasets to files"""
        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)
        
        # Save raw data
        with open(output_path / 'train_raw.json', 'w') as f:
            json.dump(train_samples, f, indent=2)
        
        with open(output_path / 'val_raw.json', 'w') as f:
            json.dump(val_samples, f, indent=2)
        
        # Format for fine-tuning
        train_formatted = self.format_for_finetuning(train_samples)
        val_formatted = self.format_for_finetuning(val_samples)
        
        # Save formatted data (JSONL format for Hugging Face)
        with open(output_path / 'train.jsonl', 'w') as f:
            for item in train_formatted:
                f.write(json.dumps(item) + '\n')
        
        with open(output_path / 'val.jsonl', 'w') as f:
            for item in val_formatted:
                f.write(json.dumps(item) + '\n')
        
        # Save as CSV for analysis
        pd.DataFrame(train_samples).to_csv(output_path / 'train.csv', index=False)
        pd.DataFrame(val_samples).to_csv(output_path / 'val.csv', index=False)
        
        # Generate statistics
        stats = {
            'total_samples': len(train_samples) + len(val_samples),
            'train_samples': len(train_samples),
            'val_samples': len(val_samples),
            'categories': list(self.categories.keys()),
            'category_distribution': {}
        }
        
        for category in self.categories:
            train_count = sum(1 for s in train_samples if s['category'] == category)
            val_count = sum(1 for s in val_samples if s['category'] == category)
            stats['category_distribution'][category] = {
                'train': train_count,
                'val': val_count,
                'total': train_count + val_count
            }
        
        with open(output_path / 'dataset_stats.json', 'w') as f:
            json.dump(stats, f, indent=2)
        
        print(f"Dataset saved to {output_path}")
        print(f"Total samples: {stats['total_samples']}")
        print(f"Train samples: {stats['train_samples']}")
        print(f"Val samples: {stats['val_samples']}")
        print("\nCategory distribution:")
        for cat, counts in stats['category_distribution'].items():
            print(f"  {cat}: {counts['total']} (train: {counts['train']}, val: {counts['val']})")

def main():
    parser = argparse.ArgumentParser(description='Generate tab categorization dataset')
    parser.add_argument('--samples', type=int, default=10000, help='Number of samples to generate')
    parser.add_argument('--split', type=float, default=0.8, help='Train/val split ratio')
    parser.add_argument('--output', type=str, default='data', help='Output directory')
    parser.add_argument('--seed', type=int, default=42, help='Random seed')
    parser.add_argument('--add-hard', action='store_true', help='Add hard examples')
    
    args = parser.parse_args()
    
    random.seed(args.seed)
    
    generator = TabCategorizationDatasetGenerator()
    
    print(f"Generating {args.samples} samples...")
    train_samples, val_samples = generator.generate_dataset(args.samples, args.split)
    
    if args.add_hard:
        print("Adding hard examples...")
        train_samples = generator.add_hard_examples(train_samples)
    
    generator.save_datasets(train_samples, val_samples, args.output)
    
    print("\nDataset generation complete!")

if __name__ == '__main__':
    main()