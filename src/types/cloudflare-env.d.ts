type BackgroundJobWakeMessage = {
  type: "wake";
};

interface CloudflareEnv {
  BACKGROUND_JOBS_QUEUE: Queue<BackgroundJobWakeMessage>;
}
