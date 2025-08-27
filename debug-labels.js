// Debug script for label visibility issues
// Run this in the browser console to diagnose label problems

function debugLabels() {
  console.group('🔍 Label Debug Report');
  
  // Check if labels container exists
  const labelsContainer = document.querySelector('#labels');
  console.log('Labels container exists:', !!labelsContainer);
  
  if (labelsContainer) {
    console.log('Labels container transform:', labelsContainer.getAttribute('transform'));
    console.log('Labels container display:', window.getComputedStyle(labelsContainer).display);
    console.log('Labels container visibility:', window.getComputedStyle(labelsContainer).visibility);
  }
  
  // Check labels-features subgroup
  const featuresGroup = document.querySelector('#labels-features');
  console.log('Features group exists:', !!featuresGroup);
  
  if (featuresGroup) {
    console.log('Features group transform:', featuresGroup.getAttribute('transform'));
    console.log('Features group display:', window.getComputedStyle(featuresGroup).display);
    
    // Count label elements
    const labelElements = featuresGroup.querySelectorAll('g.label');
    console.log('Total label elements:', labelElements.length);
    
    // Check individual labels
    let visibleCount = 0;
    labelElements.forEach((label, i) => {
      const display = window.getComputedStyle(label).display;
      const transform = label.getAttribute('transform');
      const texts = label.querySelectorAll('text');
      
      if (display !== 'none') visibleCount++;
      
      if (i < 3) { // Show first 3 labels
        console.log(`Label ${i}: display=${display}, transform=${transform}, text elements=${texts.length}`);
        texts.forEach((text, j) => {
          console.log(`  Text ${j}: fill=${text.getAttribute('fill')}, stroke=${text.getAttribute('stroke')}`);
        });
      }
    });
    
    console.log('Visible labels:', visibleCount);
  }
  
  // Check world transform
  const world = document.querySelector('#world');
  if (world) {
    console.log('World transform:', world.getAttribute('transform'));
  }
  
  // Check if placed labels data exists
  console.log('Placed labels data exists:', !!window._placedFeatureLabels);
  if (window._placedFeatureLabels) {
    console.log('Placed labels count:', window._placedFeatureLabels.length);
  }
  
  console.groupEnd();
}

// Auto-run when loaded
if (typeof window !== 'undefined') {
  // Wait a bit for the page to load
  setTimeout(debugLabels, 1000);
  
  // Make it available globally
  window.debugLabels = debugLabels;
}
