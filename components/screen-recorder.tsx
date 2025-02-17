"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Monitor, StopCircle, Pause, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function ScreenRecorder() {
  const [recordingState, setRecordingState] = useState<
    "idle" | "recording" | "paused"
  >("idle");
  const [screenRecordingUrl, setScreenRecordingUrl] = useState<string | null>(
    null
  );
  const [webcamRecordingUrl, setWebcamRecordingUrl] = useState<string | null>(
    null
  );
  const [combinedRecordingUrl, setCombinedRecordingUrl] = useState<
    string | null
  >(null);

  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const webcamRecorderRef = useRef<MediaRecorder | null>(null);

  const requestPermissions = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const webcamStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      screenStreamRef.current = screenStream;
      webcamStreamRef.current = webcamStream;

      if (screenVideoRef.current)
        screenVideoRef.current.srcObject = screenStream;
      if (webcamVideoRef.current)
        webcamVideoRef.current.srcObject = webcamStream;

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
  }, []);

  const startRecording = useCallback(async () => {
    const permissionsGranted = await requestPermissions();
    if (!permissionsGranted) return;

    const screenRecorder = new MediaRecorder(screenStreamRef.current!);
    const webcamRecorder = new MediaRecorder(webcamStreamRef.current!);

    screenRecorderRef.current = screenRecorder;
    webcamRecorderRef.current = webcamRecorder;

    const screenChunks: Blob[] = [];
    const webcamChunks: Blob[] = [];

    screenRecorder.ondataavailable = (e) => {
      screenChunks.push(e.data);
      const screenBlob = new Blob(screenChunks, { type: "video/webm" });
      setScreenRecordingUrl(URL.createObjectURL(screenBlob));
    };

    webcamRecorder.ondataavailable = (e) => {
      webcamChunks.push(e.data);
      const webcamBlob = new Blob(webcamChunks, { type: "video/webm" });
      setWebcamRecordingUrl(URL.createObjectURL(webcamBlob));
    };

    screenRecorder.start(1000); // Capture every second
    webcamRecorder.start(1000); // Capture every second

    setRecordingState("recording");
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

  const combineVideos = useCallback(async () => {
    if (!screenRecordingUrl || !webcamRecordingUrl) return;

    const screenVideo = document.createElement("video");
    const webcamVideo = document.createElement("video");

    screenVideo.src = screenRecordingUrl;
    webcamVideo.src = webcamRecordingUrl;

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

    canvas.width = screenVideo.videoWidth;
    canvas.height = screenVideo.videoHeight;

    const webcamSize = Math.min(canvas.width, canvas.height) / 4;
    const webcamX = canvas.width - webcamSize - 10;
    const webcamY = canvas.height - webcamSize - 10;

    const stream = canvas.captureStream();
    const combinedRecorder = new MediaRecorder(stream, {
      mimeType: "video/webm",
    });

    const combinedChunks: Blob[] = [];
    combinedRecorder.ondataavailable = (e) => combinedChunks.push(e.data);
    combinedRecorder.onstop = () => {
      const combinedBlob = new Blob(combinedChunks, { type: "video/webm" });
      setCombinedRecordingUrl(URL.createObjectURL(combinedBlob));
    };

    combinedRecorder.start();

    const drawFrame = () => {
      ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
      ctx.drawImage(webcamVideo, webcamX, webcamY, webcamSize, webcamSize);

      if (!screenVideo.paused && !screenVideo.ended) {
        requestAnimationFrame(drawFrame);
      } else {
        combinedRecorder.stop();
      }
    };

    screenVideo.play();
    webcamVideo.play();
    drawFrame();
  }, [screenRecordingUrl, webcamRecordingUrl]);

  const stopRecording = useCallback(() => {
    if (screenRecorderRef.current && webcamRecorderRef.current) {
      screenRecorderRef.current.stop();
      webcamRecorderRef.current.stop();
      setRecordingState("idle");

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      toast({
        title: "Recording stopped",
        description: "Combining screen and webcam recordings...",
      });

      // Combine videos after stopping the recording
      combineVideos();
    }
  }, [combineVideos]);

  useEffect(() => {
    return () => {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Screen and Webcam Recorder</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center space-x-4 mb-4">
            {recordingState === "idle" ? (
              <Button onClick={startRecording}>
                <Camera className="mr-2 h-4 w-4" /> Start Recording
              </Button>
            ) : recordingState === "recording" ? (
              <Button onClick={pauseRecording}>
                <Pause className="mr-2 h-4 w-4" /> Pause Recording
              </Button>
            ) : (
              <Button onClick={resumeRecording}>
                <Play className="mr-2 h-4 w-4" /> Resume Recording
              </Button>
            )}
            <Button
              onClick={stopRecording}
              disabled={recordingState === "idle"}
              variant="destructive"
            >
              <StopCircle className="mr-2 h-4 w-4" /> Stop Recording
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Screen Preview</h3>
              <video
                ref={screenVideoRef}
                className="w-full h-auto border rounded"
                muted
                playsInline
                autoPlay
              />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Webcam Preview</h3>
              <video
                ref={webcamVideoRef}
                className="w-full h-auto border rounded"
                muted
                playsInline
                autoPlay
              />
            </div>
          </div>
        </CardContent>
      </Card>
      {(screenRecordingUrl || webcamRecordingUrl) &&
        recordingState !== "idle" && (
          <Card>
            <CardHeader>
              <CardTitle>Live Recordings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {screenRecordingUrl && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">
                      Screen Recording
                    </h3>
                    <video
                      src={screenRecordingUrl}
                      className="w-full h-auto border rounded"
                      controls
                    />
                  </div>
                )}
                {webcamRecordingUrl && (
                  <div>
                    <h3 className="text-lg font-semibold mb-2">
                      Webcam Recording
                    </h3>
                    <video
                      src={webcamRecordingUrl}
                      className="w-full h-auto border rounded"
                      controls
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      {combinedRecordingUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Combined Recording</CardTitle>
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
