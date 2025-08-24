#!/usr/bin/env python3
"""
Model Evaluation Suite for Tab Categorization
Comprehensive evaluation metrics and benchmarks
"""

import json
import time
import argparse
from pathlib import Path
from typing import Dict, List, Tuple
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix,
    classification_report
)
import matplotlib.pyplot as plt
import seaborn as sns
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
from tqdm import tqdm

class TabCategorizationEvaluator:
    """Evaluate fine-tuned models for tab categorization"""
    
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.model = None
        self.tokenizer = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Categories
        self.categories = ['Dev', 'Social', 'Entertainment', 'Work', 'Cloud', 'Shopping', 'News']
        
        # Performance metrics
        self.metrics = {
            'accuracy': 0,
            'precision': {},
            'recall': {},
            'f1': {},
            'confusion_matrix': None,
            'inference_times': [],
            'model_size_mb': 0,
            'memory_usage_mb': 0
        }
    
    def load_model(self):
        """Load the model for evaluation"""
        print(f"Loading model from {self.model_path}")
        
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_path)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_path,
            torch_dtype=torch.float16,
            device_map=self.device
        )
        self.model.eval()
        
        # Calculate model size
        model_size = sum(p.numel() * p.element_size() for p in self.model.parameters()) / 1e6
        self.metrics['model_size_mb'] = model_size
        
        print(f"Model loaded on {self.device}")
        print(f"Model size: {model_size:.2f} MB")
    
    def predict(self, url: str, title: str) -> Tuple[str, float]:
        """Predict category for a single tab"""
        # Format prompt
        prompt = f"Categorize this browser tab into one of these categories: {', '.join(self.categories)}.\nURL: {url}\nTitle: {title}\nCategory:"
        
        # Add model-specific formatting
        if "tinyllama" in self.model_path.lower():
            formatted_prompt = f"<|system|>\nYou are a browser tab categorizer.</s>\n<|user|>\n{prompt}</s>\n<|assistant|>\n"
        else:
            formatted_prompt = f"### Instruction:\n{prompt}\n\n### Response:\n"
        
        # Tokenize
        inputs = self.tokenizer(
            formatted_prompt,
            return_tensors="pt",
            truncation=True,
            max_length=256
        ).to(self.device)
        
        # Time inference
        start_time = time.time()
        
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=10,
                temperature=0.1,
                do_sample=False,
                pad_token_id=self.tokenizer.pad_token_id
            )
        
        inference_time = (time.time() - start_time) * 1000  # Convert to ms
        
        # Decode
        response = self.tokenizer.decode(
            outputs[0][inputs['input_ids'].shape[1]:],
            skip_special_tokens=True
        ).strip()
        
        # Extract category
        predicted = response.split()[0] if response else "Unknown"
        
        # Validate category
        if predicted not in self.categories:
            # Try to find closest match
            predicted = self.find_closest_category(predicted)
        
        return predicted, inference_time
    
    def find_closest_category(self, text: str) -> str:
        """Find closest matching category"""
        text_lower = text.lower()
        
        for category in self.categories:
            if category.lower() in text_lower or text_lower in category.lower():
                return category
        
        # Default fallback
        return 'Work'
    
    def evaluate_dataset(self, test_data_path: str):
        """Evaluate on test dataset"""
        print(f"Evaluating on {test_data_path}")
        
        # Load test data
        with open(test_data_path, 'r') as f:
            test_data = [json.loads(line) for line in f]
        
        predictions = []
        actuals = []
        inference_times = []
        
        print(f"Running evaluation on {len(test_data)} samples...")
        
        for sample in tqdm(test_data):
            # Get URL and title
            url = sample.get('url', '')
            title = sample.get('title', '')
            actual = sample.get('output', sample.get('category', 'Unknown'))
            
            # Predict
            predicted, inf_time = self.predict(url, title)
            
            predictions.append(predicted)
            actuals.append(actual)
            inference_times.append(inf_time)
        
        # Calculate metrics
        self.calculate_metrics(actuals, predictions, inference_times)
        
        return self.metrics
    
    def calculate_metrics(self, actuals: List[str], predictions: List[str], inference_times: List[float]):
        """Calculate comprehensive metrics"""
        print("Calculating metrics...")
        
        # Overall accuracy
        self.metrics['accuracy'] = accuracy_score(actuals, predictions)
        
        # Per-class metrics
        precision, recall, f1, support = precision_recall_fscore_support(
            actuals, predictions, labels=self.categories, average=None, zero_division=0
        )
        
        for i, category in enumerate(self.categories):
            self.metrics['precision'][category] = precision[i]
            self.metrics['recall'][category] = recall[i]
            self.metrics['f1'][category] = f1[i]
        
        # Confusion matrix
        self.metrics['confusion_matrix'] = confusion_matrix(
            actuals, predictions, labels=self.categories
        )
        
        # Inference time statistics
        self.metrics['inference_times'] = {
            'mean': np.mean(inference_times),
            'median': np.median(inference_times),
            'std': np.std(inference_times),
            'min': np.min(inference_times),
            'max': np.max(inference_times),
            'p95': np.percentile(inference_times, 95)
        }
        
        # Memory usage (approximate)
        if torch.cuda.is_available():
            self.metrics['memory_usage_mb'] = torch.cuda.memory_allocated(self.device) / 1e6
    
    def print_report(self):
        """Print evaluation report"""
        print("\n" + "="*60)
        print("EVALUATION REPORT")
        print("="*60)
        
        print(f"\nModel: {self.model_path}")
        print(f"Model Size: {self.metrics['model_size_mb']:.2f} MB")
        
        if self.metrics['memory_usage_mb'] > 0:
            print(f"GPU Memory Usage: {self.metrics['memory_usage_mb']:.2f} MB")
        
        print(f"\nOverall Accuracy: {self.metrics['accuracy']:.2%}")
        
        print("\nPer-Category Metrics:")
        print(f"{'Category':<15} {'Precision':<10} {'Recall':<10} {'F1-Score':<10}")
        print("-" * 45)
        
        for category in self.categories:
            print(f"{category:<15} "
                  f"{self.metrics['precision'][category]:<10.2%} "
                  f"{self.metrics['recall'][category]:<10.2%} "
                  f"{self.metrics['f1'][category]:<10.2%}")
        
        print("\nInference Time Statistics (ms):")
        inf_times = self.metrics['inference_times']
        print(f"  Mean: {inf_times['mean']:.2f}")
        print(f"  Median: {inf_times['median']:.2f}")
        print(f"  Std Dev: {inf_times['std']:.2f}")
        print(f"  Min: {inf_times['min']:.2f}")
        print(f"  Max: {inf_times['max']:.2f}")
        print(f"  95th Percentile: {inf_times['p95']:.2f}")
        
        print("\nPerformance Summary:")
        if inf_times['mean'] < 50:
            print("✓ Excellent inference speed (<50ms)")
        elif inf_times['mean'] < 100:
            print("✓ Good inference speed (<100ms)")
        else:
            print("⚠ Slow inference speed (>100ms)")
        
        if self.metrics['accuracy'] > 0.9:
            print("✓ Excellent accuracy (>90%)")
        elif self.metrics['accuracy'] > 0.8:
            print("✓ Good accuracy (>80%)")
        else:
            print("⚠ Low accuracy (<80%)")
        
        if self.metrics['model_size_mb'] < 500:
            print("✓ Suitable for browser deployment (<500MB)")
        elif self.metrics['model_size_mb'] < 1000:
            print("⚠ Large for browser deployment (500MB-1GB)")
        else:
            print("✗ Too large for browser deployment (>1GB)")
    
    def plot_confusion_matrix(self, output_path: str = None):
        """Plot confusion matrix"""
        if self.metrics['confusion_matrix'] is None:
            print("No confusion matrix to plot")
            return
        
        plt.figure(figsize=(10, 8))
        sns.heatmap(
            self.metrics['confusion_matrix'],
            annot=True,
            fmt='d',
            cmap='Blues',
            xticklabels=self.categories,
            yticklabels=self.categories
        )
        plt.title('Confusion Matrix - Tab Categorization')
        plt.ylabel('Actual Category')
        plt.xlabel('Predicted Category')
        
        if output_path:
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            print(f"Confusion matrix saved to {output_path}")
        else:
            plt.show()
    
    def benchmark_realworld(self):
        """Benchmark on real-world examples"""
        print("\nRunning real-world benchmark...")
        
        real_examples = [
            # Dev
            {'url': 'https://github.com/facebook/react', 'title': 'GitHub - facebook/react: A declarative, efficient, and flexible JavaScript library', 'expected': 'Dev'},
            {'url': 'https://stackoverflow.com/questions/12345', 'title': 'python - How to merge two dictionaries - Stack Overflow', 'expected': 'Dev'},
            
            # Social
            {'url': 'https://twitter.com/elonmusk', 'title': 'Elon Musk (@elonmusk) / Twitter', 'expected': 'Social'},
            {'url': 'https://www.linkedin.com/in/johndoe', 'title': 'John Doe - Software Engineer - LinkedIn', 'expected': 'Social'},
            
            # Entertainment
            {'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'title': 'Rick Astley - Never Gonna Give You Up - YouTube', 'expected': 'Entertainment'},
            {'url': 'https://www.netflix.com/title/80100172', 'title': 'Dark | Netflix Official Site', 'expected': 'Entertainment'},
            
            # Work
            {'url': 'https://docs.google.com/document/d/1234/edit', 'title': 'Project Proposal - Google Docs', 'expected': 'Work'},
            {'url': 'https://mail.google.com/mail/u/0/#inbox', 'title': 'Gmail - Inbox (42)', 'expected': 'Work'},
            
            # Cloud
            {'url': 'https://console.aws.amazon.com/ec2/', 'title': 'EC2 Management Console', 'expected': 'Cloud'},
            {'url': 'https://portal.azure.com/#home', 'title': 'Microsoft Azure Portal', 'expected': 'Cloud'},
            
            # Shopping
            {'url': 'https://www.amazon.com/dp/B08N5WRWNW', 'title': 'Echo Dot (4th Gen) | Smart speaker with Alexa', 'expected': 'Shopping'},
            {'url': 'https://www.ebay.com/itm/123456789', 'title': 'Vintage Camera for sale | eBay', 'expected': 'Shopping'},
            
            # News
            {'url': 'https://www.cnn.com/2024/01/15/tech/ai-breakthrough', 'title': 'Major AI breakthrough announced - CNN', 'expected': 'News'},
            {'url': 'https://www.bbc.com/news/technology-12345678', 'title': 'Tech giants face new regulations - BBC News', 'expected': 'News'},
        ]
        
        correct = 0
        total = len(real_examples)
        
        print(f"\n{'URL':<50} {'Expected':<12} {'Predicted':<12} {'Correct':<8} {'Time (ms)':<10}")
        print("-" * 100)
        
        for example in real_examples:
            predicted, inf_time = self.predict(example['url'], example['title'])
            is_correct = predicted == example['expected']
            if is_correct:
                correct += 1
            
            url_display = example['url'][:47] + '...' if len(example['url']) > 50 else example['url']
            print(f"{url_display:<50} {example['expected']:<12} {predicted:<12} "
                  f"{'✓' if is_correct else '✗':<8} {inf_time:<10.2f}")
        
        accuracy = correct / total
        print(f"\nReal-world Accuracy: {accuracy:.2%} ({correct}/{total})")
        
        return accuracy
    
    def save_metrics(self, output_path: str):
        """Save metrics to JSON file"""
        # Convert numpy arrays to lists for JSON serialization
        metrics_json = {
            'model_path': self.model_path,
            'accuracy': self.metrics['accuracy'],
            'precision': self.metrics['precision'],
            'recall': self.metrics['recall'],
            'f1': self.metrics['f1'],
            'confusion_matrix': self.metrics['confusion_matrix'].tolist() if self.metrics['confusion_matrix'] is not None else None,
            'inference_times': self.metrics['inference_times'],
            'model_size_mb': self.metrics['model_size_mb'],
            'memory_usage_mb': self.metrics['memory_usage_mb']
        }
        
        with open(output_path, 'w') as f:
            json.dump(metrics_json, f, indent=2)
        
        print(f"Metrics saved to {output_path}")

def compare_models(model_paths: List[str], test_data_path: str):
    """Compare multiple models"""
    print("Comparing multiple models...")
    
    results = []
    
    for model_path in model_paths:
        print(f"\nEvaluating: {model_path}")
        evaluator = TabCategorizationEvaluator(model_path)
        evaluator.load_model()
        metrics = evaluator.evaluate_dataset(test_data_path)
        
        results.append({
            'model': model_path,
            'accuracy': metrics['accuracy'],
            'avg_inference_ms': metrics['inference_times']['mean'],
            'model_size_mb': metrics['model_size_mb']
        })
    
    # Create comparison dataframe
    df = pd.DataFrame(results)
    df = df.sort_values('accuracy', ascending=False)
    
    print("\n" + "="*60)
    print("MODEL COMPARISON")
    print("="*60)
    print(df.to_string(index=False))
    
    # Identify best model
    best_model = df.iloc[0]
    print(f"\nBest Model: {best_model['model']}")
    print(f"  Accuracy: {best_model['accuracy']:.2%}")
    print(f"  Inference: {best_model['avg_inference_ms']:.2f} ms")
    print(f"  Size: {best_model['model_size_mb']:.2f} MB")
    
    return df

def main():
    parser = argparse.ArgumentParser(description='Evaluate tab categorization model')
    parser.add_argument('--model', type=str, required=True,
                       help='Path to model to evaluate')
    parser.add_argument('--test-data', type=str, default='data/val.jsonl',
                       help='Path to test data')
    parser.add_argument('--output', type=str, default='evaluation_results',
                       help='Output directory for results')
    parser.add_argument('--plot', action='store_true',
                       help='Generate plots')
    parser.add_argument('--benchmark', action='store_true',
                       help='Run real-world benchmark')
    parser.add_argument('--compare', nargs='+',
                       help='Compare multiple models')
    
    args = parser.parse_args()
    
    # Create output directory
    output_dir = Path(args.output)
    output_dir.mkdir(exist_ok=True)
    
    if args.compare:
        # Compare multiple models
        compare_models(args.compare, args.test_data)
    else:
        # Evaluate single model
        evaluator = TabCategorizationEvaluator(args.model)
        evaluator.load_model()
        
        # Evaluate on test set
        evaluator.evaluate_dataset(args.test_data)
        
        # Print report
        evaluator.print_report()
        
        # Run real-world benchmark if requested
        if args.benchmark:
            evaluator.benchmark_realworld()
        
        # Generate plots if requested
        if args.plot:
            evaluator.plot_confusion_matrix(output_dir / 'confusion_matrix.png')
        
        # Save metrics
        evaluator.save_metrics(output_dir / 'metrics.json')
    
    print("\nEvaluation complete!")

if __name__ == '__main__':
    main()