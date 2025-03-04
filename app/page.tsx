"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Camera,
  Monitor,
  StopCircle,
  Pause,
  Play,
  Loader2,
  Mic,
  MicOff,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type VideoQuality = "480p" | "720p" | "1080p" | "1440p" | "2160p";

const videoQualities: {
  [key in VideoQuality]: { width: number; height: number };
} = {
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "2160p": { width: 3840, height: 2160 },
};

export default function Component() {
  const [recordingState, setRecordingState] = useState<
    "idle" | "recording" | "paused" | "processing"
  >("idle");
  const [combinedRecordingUrl, setCombinedRecordingUrl] = useState<
    string | null
  >(null);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("1080p");
  const [webcamPosition, setWebcamPosition] = useState({ x: 5, y: 80 });
  const [webcamSize, setWebcamSize] = useState(17); // percentage of screen width
  const [webcamBorderRadius, setWebcamBorderRadius] = useState(25); // percentage of border radius
  const [showPreview, setShowPreview] = useState(false);
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);

  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const webcamRecorderRef = useRef<MediaRecorder | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const requestPermissions = useCallback(async () => {
    try {
      const { width, height } = videoQualities[videoQuality];
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width, height },
        audio: true,
      });
      const webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width, height },
        audio: true,
      });

      screenStreamRef.current = screenStream;
      webcamStreamRef.current = webcamStream;

      if (screenVideoRef.current)
        screenVideoRef.current.srcObject = screenStream;
      if (webcamVideoRef.current)
        webcamVideoRef.current.srcObject = webcamStream;

      // Set up audio analysis
      const audioContext = new AudioContext();
      const audioSource = audioContext.createMediaStreamSource(webcamStream);
      const analyser = audioContext.createAnalyser();
      audioSource.connect(analyser);
      audioAnalyserRef.current = analyser;

      toast({
        title: "Permissions granted",
        description: "Screen and webcam access have been allowed.",
      });

      return true;
    } catch (error) {
      console.error("Error requesting permissions:", error);
      toast({
        title: "Permission denied",
        description:
          "Please allow access to your screen and webcam to start recording.",
        variant: "destructive",
      });
      return false;
    }
  }, [videoQuality]);

  const startRecording = useCallback(async () => {
    const permissionsGranted = await requestPermissions();
    if (!permissionsGranted) return;

    const screenRecorder = new MediaRecorder(screenStreamRef.current!, {
      mimeType: "video/webm; codecs=vp9",
    });
    const webcamRecorder = new MediaRecorder(webcamStreamRef.current!, {
      mimeType: "video/webm; codecs=vp9",
    });

    screenRecorderRef.current = screenRecorder;
    webcamRecorderRef.current = webcamRecorder;

    const screenChunks: Blob[] = [];
    const webcamChunks: Blob[] = [];

    screenRecorder.ondataavailable = (e) => screenChunks.push(e.data);
    webcamRecorder.ondataavailable = (e) => webcamChunks.push(e.data);

    screenRecorder.onstop = () => {
      const screenBlob = new Blob(screenChunks, { type: "video/webm" });
      const webcamBlob = new Blob(webcamChunks, { type: "video/webm" });
      combineVideos(screenBlob, webcamBlob);
    };

    screenRecorder.start(1000); // Capture every second
    webcamRecorder.start(1000); // Capture every second

    setRecordingState("recording");

    // Start voice detection
    detectVoice();
  }, [requestPermissions]);

  const pauseRecording = useCallback(() => {
    if (screenRecorderRef.current && webcamRecorderRef.current) {
      screenRecorderRef.current.pause();
      webcamRecorderRef.current.pause();
      setRecordingState("paused");
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (screenRecorderRef.current && webcamRecorderRef.current) {
      screenRecorderRef.current.resume();
      webcamRecorderRef.current.resume();
      setRecordingState("recording");
    }
  }, []);

  const combineVideos = useCallback(
    async (screenBlob: Blob, webcamBlob: Blob) => {
      setRecordingState("processing");

      const screenVideo = document.createElement("video");
      const webcamVideo = document.createElement("video");

      screenVideo.src = URL.createObjectURL(screenBlob);
      webcamVideo.src = URL.createObjectURL(webcamBlob);

      await Promise.all([
        new Promise((resolve) => (screenVideo.onloadedmetadata = resolve)),
        new Promise((resolve) => (webcamVideo.onloadedmetadata = resolve)),
      ]);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        console.error("Unable to create canvas context");
        return;
      }

      const { width, height } = videoQualities[videoQuality];
      canvas.width = width;
      canvas.height = height;

      const webcamWidth = (webcamSize / 100) * width;
      const webcamHeight =
        (webcamWidth / webcamVideo.videoWidth) * webcamVideo.videoHeight;
      const webcamX = (webcamPosition.x / 100) * (width - webcamWidth);
      const webcamY = (webcamPosition.y / 100) * (height - webcamHeight);

      const stream = canvas.captureStream();
      const combinedRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm; codecs=vp9",
      });

      const combinedChunks: Blob[] = [];
      combinedRecorder.ondataavailable = (e) => combinedChunks.push(e.data);
      combinedRecorder.onstop = () => {
        const combinedBlob = new Blob(combinedChunks, { type: "video/webm" });
        setCombinedRecordingUrl(URL.createObjectURL(combinedBlob));
        setRecordingState("idle");
      };

      combinedRecorder.start();

      const drawFrame = () => {
        ctx.drawImage(screenVideo, 0, 0, width, height);
        ctx.drawImage(webcamVideo, webcamX, webcamY, webcamWidth, webcamHeight);

        if (!screenVideo.paused && !screenVideo.ended) {
          requestAnimationFrame(drawFrame);
        } else {
          combinedRecorder.stop();
        }
      };

      screenVideo.play();
      webcamVideo.play();
      drawFrame();

      // Combine audio tracks
      const audioContext = new AudioContext();
      const screenAudioSource = audioContext.createMediaElementSource(screenVideo);
      const webcamAudioSource = audioContext.createMediaElementSource(webcamVideo);
      const destination = audioContext.createMediaStreamDestination();

      screenAudioSource.connect(destination);
      webcamAudioSource.connect(destination);

      const combinedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);

      const finalRecorder = new MediaRecorder(combinedStream, {
        mimeType: "video/webm; codecs=vp9",
      });

      const finalChunks: Blob[] = [];
      finalRecorder.ondataavailable = (e) => finalChunks.push(e.data);
      finalRecorder.onstop = () => {
        const finalBlob = new Blob(finalChunks, { type: "video/webm" });
        setCombinedRecordingUrl(URL.createObjectURL(finalBlob));
        setRecordingState("idle");
      };

      finalRecorder.start();
      combinedRecorder.onstop = () => finalRecorder.stop();
    },
    [videoQuality, webcamPosition, webcamSize]
  );

  const stopRecording = useCallback(() => {
    if (screenRecorderRef.current && webcamRecorderRef.current) {
      screenRecorderRef.current.stop();
      webcamRecorderRef.current.stop();

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Stop voice detection
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      toast({
        title: "Recording stopped",
        description: "Preparing final video...",
      });
    }
  }, []);

  const detectVoice = useCallback(() => {
    if (!audioAnalyserRef.current) return;

    const analyser = audioAnalyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkAudio = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      setIsVoiceDetected(average > 10); // Adjust threshold as needed

      animationFrameRef.current = requestAnimationFrame(checkAudio);
    };

    checkAudio();
  }, []);

  useEffect(() => {
    return () => {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Update webcam preview position and size
  useEffect(() => {
    if (webcamVideoRef.current && screenVideoRef.current) {
      const screenWidth = screenVideoRef.current.offsetWidth;
      const screenHeight = screenVideoRef.current.offsetHeight;

      const webcamWidth = (webcamSize / 100) * screenWidth;
      const webcamHeight =
        (webcamWidth / webcamVideoRef.current.videoWidth) *
        webcamVideoRef.current.videoHeight;

      const webcamX = (webcamPosition.x / 100) * (screenWidth - webcamWidth);
      const webcamY = (webcamPosition.y / 100) * (screenHeight - webcamHeight);

      webcamVideoRef.current.style.position = "absolute";
      webcamVideoRef.current.style.width = `${webcamWidth}px`;
      webcamVideoRef.current.style.height = `${webcamHeight}px`;
      webcamVideoRef.current.style.left = `${webcamX}px`;
      webcamVideoRef.current.style.top = `${webcamY}px`;
      webcamVideoRef.current.style.borderRadius = `${webcamBorderRadius}%`;
    }
  }, [webcamPosition, webcamSize, webcamBorderRadius, showPreview]);

  const isRecording =
    recordingState === "recording" || recordingState === "paused";
  return (
    <div className="container mx-auto p-4">
      <div className="sticky top-0 z-10 bg-gradient-to-r from-purple-500 to-pink-500 p-4 mb-4 border-b-2 border-white">
        <h1 className="text-3xl font-bold text-white text-center">reckshack</h1>
      </div>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Screen and Webcam Recorder</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="video-quality">Video Quality</Label>
              <Select
                value={videoQuality}
                onValueChange={(value: VideoQuality) => setVideoQuality(value)}
                disabled={isRecording}
              >
                <SelectTrigger id="video-quality">
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(videoQualities).map((quality) => (
                    <SelectItem key={quality} value={quality}>
                      {quality}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="webcam-size">Webcam Size (%)</Label>
              <Slider
                id="webcam-size"
                min={10}
                max={50}
                step={1}
                value={[webcamSize]}
                onValueChange={([value]) => setWebcamSize(value)}
                disabled={isRecording}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="webcam-x">Webcam X Position (%)</Label>
              <Slider
                id="webcam-x"
                min={0}
                max={100}
                step={1}
                value={[webcamPosition.x]}
                onValueChange={([value]) =>
                  setWebcamPosition((prev) => ({ ...prev, x: value }))
                }
                disabled={isRecording}
              />
            </div>
            <div>
              <Label htmlFor="webcam-y">Webcam Y Position (%)</Label>
              <Slider
                id="webcam-y"
                min={0}
                max={100}
                step={1}
                value={[webcamPosition.y]}
                onValueChange={([value]) =>
                  setWebcamPosition((prev) => ({ ...prev, y: value }))
                }
                disabled={isRecording}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="webcam-border-radius">Webcam Border Radius (%)</Label>
              <Slider
                id="webcam-border-radius"
                min={0}
                max={50}
                step={1}
                value={[webcamBorderRadius]}
                onValueChange={([value]) => setWebcamBorderRadius(value)}
                disabled={isRecording}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2 mb-4">
            <Switch
              id="show-preview"
              checked={showPreview}
              onCheckedChange={setShowPreview}
              disabled={isRecording}
            />
            <Label htmlFor="show-preview">Show Preview</Label>
          </div>
          <div className="flex justify-center space-x-4 mb-4">
            {recordingState === "idle" ? (
              <Button onClick={startRecording}>
                <Camera className="mr-2 h-4 w-4" /> Start Recording
              </Button>
            ) : recordingState === "recording" ? (
              <Button onClick={pauseRecording}>
                <Pause className="mr-2 h-4 w-4" /> Pause Recording
              </Button>
            ) : recordingState === "paused" ? (
              <Button onClick={resumeRecording}>
                <Play className="mr-2 h-4 w-4" /> Resume Recording
              </Button>
            ) : null}
            <Button
              onClick={stopRecording}
              disabled={
                recordingState === "idle" || recordingState === "processing"
              }
              variant="destructive"
            >
              <StopCircle className="mr-2 h-4 w-4" /> Stop Recording
            </Button>
          </div>
          {isRecording && (
            <div className="flex items-center justify-center space-x-2 mb-4">
              {isVoiceDetected ? (
                <Mic className="h-6 w-6 text-green-500" />
              ) : (
                <MicOff className="h-6 w-6 text-red-500" />
              )}
              <span>
                {isVoiceDetected ? "Voice detected" : "No voice detected"}
              </span>
            </div>
          )}
          {showPreview && (
            <div className="relative">
              <video
                ref={screenVideoRef}
                className="w-full h-auto border rounded max-w-md" // Add max-w-md class
                muted
                playsInline
                autoPlay
              />
              <video
                ref={webcamVideoRef}
                className="absolute border rounded max-w-xs" // Add max-w-xs class
                muted
                playsInline
                autoPlay
              />
            </div>
          )}
        </CardContent>
      </Card>
      {recordingState === "processing" && (
        <div className="flex flex-col items-center justify-center p-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="mt-2 text-lg font-semibold">Preparing video...</p>
        </div>
      )}
      {combinedRecordingUrl && recordingState === "idle" && (
        <Card>
          <CardHeader>
            <CardTitle>Final Recording</CardTitle>
          </CardHeader>
          <CardContent>
            <video
              src={combinedRecordingUrl}
              className="w-full h-auto border rounded"
              controls
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
