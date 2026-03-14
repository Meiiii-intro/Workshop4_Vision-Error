## Project Title

Vision Error


## Concept

This project begins from my recent experience of suffering from **Acute Anterior Uveitis**, during which the world collapsed into a blurred, unstable, and fog-like visual field. Starting from this bodily condition, the work reflects on life under **big algorithms**, where truth is often obscured and the harder we try to see clearly, the less certain our vision becomes.

Through machine seeing, the project stages this fragile relationship between perception and resistance. When the viewer squints, the image becomes only slightly clearer through physical effort, but full clarity remains inaccessible. A more readable view is only available through an external device — the mobile interface. This suggests a condition of contemporary sensory alienation: as our natural senses become insufficient, we increasingly rely on digital 
prostheses to restore, mediate, and complete our perception of the world.


## Technology Used

# 1. Face & Eye Tracking
-To capture eye movement more accurately, I used MediaPipe Face Landmarker instead of the more basic ml5.js library. This model detects 468 facial landmarks, allowing the system to track the eyelids more precisely through LEFT_EYE_INDICES and RIGHT_EYE_INDICES.

The interaction is based on the getEyeOpenRatio() function, which uses Eye Aspect Ratio (EAR) to measure how open the eyes are. Compared with simple pixel distance, this method is more stable because it is less affected by how far the user is from the camera.

-Implementation(Core Code)
//Define eyelid landmakrks(MediaPipe Indexing)
Const LEFT_EYE_INDICES = [33, 133, 159, 145, 160, 144, 158, 153];
Const RIGHT_EYE_INDICES = [362, 263, 386, 374, 385, 380, 387, 373];

// Calculate Eye Aspect Ratio (EAR)
function getEyeOpenRatio(landmarks, upperIndex, lowerIndex, leftCornerIndex, rightCornerIndex) {

// Vertical distance between upper and lower eyelids
  const verticalDist = dist(landmarks[upperIndex].x, landmarks[upperIndex].y, 
                            landmarks[lowerIndex].x, landmarks[lowerIndex].y);

// Horizontal distance between eye corners
  const horizontalDist = dist(landmarks[leftCornerIndex].x, landmarks[leftCornerIndex].y, 
                              landmarks[rightCornerIndex].x, landmarks[rightCornerIndex].y);
  return verticalDist / horizontalDist;
}



## Live Demo

https://workshop4-vision-error.onrender.com
Note: Please allow camera access on both desktop and mobile devices. A laptop with a webcam is required for the best experience.



## How to run locally
1. Unzip the package and open the folder in your terminal.
2. Run'npm install' and 'node server.js'.
3. Open 'http://localhost:3000' in Chrome.
4. Important: Ensure your smartphone and laptop are connected to the SAME Wi-Fi network.
5. Scan the QR code. The system will automatically detect your local IP for the mobile link.

